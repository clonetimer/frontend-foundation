#!/usr/bin/env node
/** Production Studio editor trial package: checksum, SPA routing and real Chromium. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../../artifacts/pattern-atlas/studio-rc');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.status, 'candidate-unpromoted');
for (const file of manifest.files) {
  const bytes = readFileSync(join(directory, file.path));
  assert.equal(bytes.length, file.size, 'Candidate file size drift: ' + file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, 'Candidate SHA drift: ' + file.path);
}
const serverPort = 5398, debugPort = 9398;
const origin = 'http://127.0.0.1:' + serverPort;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, label, limit = 25000) {
  const start = Date.now(); let last;
  while (Date.now() - start < limit) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await pause(150);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + String(last) : ''));
}
// On real Windows, launch the *shipped .cmd file*, not just the Node server.
const windows = process.platform === 'win32';
if (windows) {
  const launcher = join(directory, 'start-studio.cmd');
  assert(existsSync(launcher), 'Missing Windows trial launcher');
  assert.match(readFileSync(launcher, 'utf8'), /node serve\.mjs/, 'Windows launcher no longer starts Studio');
}
const server = spawn(windows ? (process.env.ComSpec || 'cmd.exe') : process.execPath,
  windows ? ['/d', '/c', 'start-studio.cmd'] : ['serve.mjs'],
  { cwd: directory, env: { ...process.env, ATLAS_STUDIO_PORT: String(serverPort) },
    stdio: 'inherit' });
const profile = mkdtempSync(join(tmpdir(), 'studio-rc-smoke-'));
let browser, socket;
try {
  await until(async () => (await fetch(origin + '/studio')).ok, 'candidate static server');
  for (const path of ['/create', '/studio']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, 'SPA route: ' + path);
    assert.match(await response.text(), /assets\//, 'Missing production HTML asset entry');
  }
  const js = manifest.files.find((file) => file.path.startsWith('site/assets/') && file.path.endsWith('.js'));
  assert(js, 'Missing compiled JavaScript');
  const asset = await fetch(origin + '/' + js.path.slice(5));
  assert.equal(asset.status, 200, 'Compiled asset missing');
  assert.match(asset.headers.get('content-type') || '', /javascript/);
  assert.equal((await fetch(origin + '/assets/not-real.js')).status, 404, 'Missing JS must be 404, not the SPA');
  browser = spawn(process.env.CHROMIUM_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-proxy-server', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  await until(async () => (await fetch('http://127.0.0.1:' + debugPort + '/json/version')).ok, 'Chromium CDP');
  const tab = await fetch('http://127.0.0.1:' + debugPort + '/json/new?about:blank', { method: 'PUT' });
  assert.equal(tab.status, 200);
  const target = await tab.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(String(event.data));
    if (result.method === 'Runtime.exceptionThrown')
      errors.push(result.params?.exceptionDetails?.text || 'Browser exception');
    const waiting = pending.get(result.id);
    if (waiting) {
      pending.delete(result.id); clearTimeout(waiting.timer);
      if (result.error) waiting.reject(new Error(result.error.message)); else waiting.resolve(result.result);
    }
  });
  function call(method, params = {}) {
    return new Promise((done, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP ' + method + ' timeout')); }, 10000);
      pending.set(id, { resolve: done, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: origin + '/create' });
  await until(() => evaluate("Boolean(document.querySelector('.pa-create') && document.body.textContent.includes('进入拖拽设计器'))"), 'production create page');
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("Boolean(document.querySelector('.pa-studio-toolbar') && document.querySelector('.pa-studio-inspector-rail'))"), 'production Studio editor');
  assert.deepEqual(errors, [], 'Unexpected editor JavaScript exceptions');
  console.log(JSON.stringify({ result: 'PASS', revision: manifest.sourceCommit,
    scenario: 'packaged editor / production React / Chromium',
    platform: process.platform,
    checks: ['SHA-256', 'static JS', 'SPA route', '404 fallback', '/create', '/studio', 'runtime errors',
      windows ? 'Windows start-studio.cmd launcher' : 'POSIX node launcher'] }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (windows && server.pid) {
    // cmd.exe owns the spawned Node process; kill its whole Windows job tree.
    try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch { server.kill(); }
  } else { server.kill(); }
  if (windows && browser?.pid) {
    try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch { browser.kill(); }
  } else { browser?.kill(); }
  await pause(400);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); }
  catch { /* temporary profile cleanup is best-effort */ }
}
