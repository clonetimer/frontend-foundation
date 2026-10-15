#!/usr/bin/env node
/** Production Studio editor trial package: checksum, SPA routing and real Chromium. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
let browser, socket, aasFixtureServer, aasBridge;
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

  // P0 in the actual packaged production editor, not a source-only unit test.
  const evidenceDir = resolve(import.meta.dirname, '../../artifacts/pattern-atlas/studio-p0-evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const accepted = [];
  const pass = (id) => accepted.push({ id, status: 'PASS' });
  const stored = () => evaluate("JSON.parse(localStorage.getItem('foundation-showcase:pattern-atlas:studio-v1') || 'null')");
  const countNodes = (node) => 1 + (node.children || []).reduce((n, x) => n + countNodes(x), 0);
  const projectName = 'Stable-P0-' + manifest.sourceCommit.slice(0, 8);
  await call('Page.navigate', { url: origin + '/create' });
  await until(() => evaluate("!!document.querySelector('#pa-builder-project-title')"), 'P0 project form');
  assert(await evaluate("(() => { const x=document.querySelector('#pa-builder-project-title'); x.focus(); x.select(); return true; })()"));
  await call('Input.insertText', { text: projectName });
  await until(() => evaluate("document.querySelector('#pa-builder-project-title')?.value === " + JSON.stringify(projectName)), 'P0 title input');
  assert(await evaluate("(() => {const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('进入拖拽设计器'));if(!x||x.disabled)return false;x.click();return true;})()"), 'P0 creation CTA');
  await until(() => evaluate("document.querySelector('.pa-studio h1')?.textContent === " + JSON.stringify(projectName)), 'P0 creation handoff');
  pass('create-project-and-handoff');

  const before = await stored();
  assert(before?.blueprint?.pages?.[0]?.composition, 'P0 initial autosave absent');
  const originalCount = countNodes(before.blueprint.pages[0].composition);
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-palette-item')].find(x=>x.querySelector('strong')?.textContent?.trim()==='文字标题');if(!e)return false;e.click();return true;})()"), 'P0 text widget missing');
  await until(async () => {
    const saved = await stored();
    return saved?.blueprint?.pages?.[0]?.composition && countNodes(saved.blueprint.pages[0].composition) === originalCount + 1;
  }, 'P0 component insertion/autosave');
  pass('insert-component-and-autosave');

  assert(await evaluate("(() => {const e=document.querySelector('.pa-studio-inspector-rail button[title=风格]');if(!e)return false;e.click();return true;})()"), 'P0 style tab');
  await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('项目名称'))?.querySelector('input')"), 'P0 style editor');
  const edited = projectName + '-Edited';
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('项目名称'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"));
  await call('Input.insertText', { text: edited });
  await until(async () => (await stored())?.blueprint?.project?.title === edited, 'P0 inspector property persistence');
  pass('inspector-property-edit');

  // Capture the whole three-panel desktop UI, not the CDP default 800px viewport.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [label, device] of [['手机', 'mobile'], ['平板', 'tablet'], ['桌面', 'desktop']]) {
    const expression = "(() => {const x=[...document.querySelectorAll('.pa-studio-toolbar .ant-segmented-item')].find(e=>e.textContent?.trim()===" + JSON.stringify(label) + ");if(!x)return false;x.click();return true;})()";
    assert(await evaluate(expression), 'P0 responsive control ' + label);
    await until(() => evaluate("!!document.querySelector('.pa-studio-device.device-" + device + "')"), 'P0 device ' + device);
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    assert(shot.data, 'P0 screenshot failed: ' + device);
    writeFileSync(join(evidenceDir, device + '.png'), Buffer.from(shot.data, 'base64'));
  }
  pass('responsive-preview-and-screenshots');

  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P0 live button');
  await until(() => evaluate("document.querySelector('.pa-studio-stage-crumb')?.textContent?.includes('交互体验')"), 'P0 live switch');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='编辑');if(!e)return false;e.click();return true;})()"), 'P0 edit button');
  await until(() => evaluate("document.querySelector('.pa-studio-stage-crumb')?.textContent?.includes('自由编辑')"), 'P0 return edit');
  pass('live-edit-switch');

  const expected = await stored();
  assert.equal(expected.blueprint.project.title, edited);
  await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-head-actions button')].find(x=>x.textContent?.includes('导出页面代码'));if(!e)return false;e.click();return true;})()"), 'P0 download button');
  const zipPath = await until(() => {
    const matches = readdirSync(profile).filter(n => n.endsWith('-frontend.zip') && existsSync(join(profile, n)));
    return matches.length ? join(profile, matches[0]) : null;
  }, 'P0 exported ZIP download');
  function storedZipEntry(bytes, target) {
    for (let pos = 0; pos + 30 < bytes.length;) {
      if (bytes.readUInt32LE(pos) !== 0x04034b50) break;
      const method = bytes.readUInt16LE(pos + 8), length = bytes.readUInt32LE(pos + 18);
      const nameLength = bytes.readUInt16LE(pos + 26), extraLength = bytes.readUInt16LE(pos + 28);
      const name = bytes.subarray(pos + 30, pos + 30 + nameLength).toString('utf8');
      const offset = pos + 30 + nameLength + extraLength;
      if (name === target) {
        assert.equal(method, 0, 'P0 ZIP compression changed');
        return bytes.subarray(offset, offset + length).toString('utf8');
      }
      pos = offset + length;
    }
    throw new Error('P0 ZIP missing ' + target);
  }
  const zip = readFileSync(zipPath);
  const studioJson = storedZipEntry(zip, 'atlas.studio.json');
  assert.deepEqual(JSON.parse(studioJson), expected, 'P0 ZIP Studio document lost edits');
  assert.deepEqual(JSON.parse(storedZipEntry(zip, 'foundation.project.json')), expected.blueprint, 'P0 Blueprint export mismatch');
  pass('real-browser-zip-download-and-blueprint');

  const inputFile = join(profile, 'P0-roundtrip.studio.json');
  writeFileSync(inputFile, studioJson);
  assert(await evaluate("(() => { localStorage.clear();sessionStorage.clear();return true; })()"));
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("!!document.querySelector('.pa-studio-head-actions input[type=file]')"), 'P0 clean editor');
  assert.notEqual(await evaluate("document.querySelector('.pa-studio h1')?.textContent"), edited, 'P0 cache was not cleared');
  await call('DOM.enable');
  const dom = await call('DOM.getDocument');
  const selected = await call('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[aria-label="打开项目文件"]' });
  assert(selected.nodeId, 'P0 import input missing');
  await call('DOM.setFileInputFiles', { nodeId: selected.nodeId, files: [inputFile] });
  await until(() => evaluate("document.querySelector('.pa-studio h1')?.textContent === " + JSON.stringify(edited)), 'P0 reimport');
  await until(async () => JSON.stringify(await stored()) === JSON.stringify(expected), 'P0 import semantic parity');
  pass('clear-storage-and-exact-studio-reimport');

  // Cross-app browser contract path: production Studio -> Python bridge ->
  // actual HTTP server implementing AAS model API SHAPE (synthetic, not user source).
  // The separately tested user-supplied native AAS+SQLite is NOT shipped in CI.
  let nativeListCalls = 0;
  const aasRows = [
    { id: 10, model_name: 'AAS-CI-Model-10', status: 'published', algorithm: 'dummy_detector', experiment_id: 'p0_case_10' },
    { id: 11, model_name: 'AAS-CI-Model-11', status: 'draft', algorithm: 'dummy_detector', experiment_id: 'p0_case_11' },
    { id: 12, model_name: 'AAS-CI-Model-12', status: 'published', algorithm: 'dummy_detector', experiment_id: 'p0_case_12' }
  ];
  aasFixtureServer = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method !== 'GET' || path !== '/api/models') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"No such native fixture"}');
      return;
    }
    nativeListCalls++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ models: aasRows, total: aasRows.length }));
  });
  await new Promise((done) => aasFixtureServer.listen(0, '127.0.0.1', done));
  const aasPort = aasFixtureServer.address().port;
  const bridgePort = 5498;
  const bridgeOrigin = 'http://127.0.0.1:' + bridgePort;
  const python = process.platform === 'win32' ? 'python' : 'python3';
  aasBridge = spawn(python, [
    'tooling/scripts/aas_p0/bridge.py', '--upstream', 'http://127.0.0.1:' + aasPort + '/',
    '--origin', origin + '/', '--port', String(bridgePort)
  ], { cwd: resolve(import.meta.dirname, '../..'), stdio: 'ignore' });
  let aasBridgeStartupError;
  aasBridge.on('error', (error) => { aasBridgeStartupError = error; });
  await until(async () => {
    if (aasBridgeStartupError) throw aasBridgeStartupError;
    if (aasBridge.exitCode !== null) throw new Error('Python AAS fixture bridge exited early');
    const response = await fetch(bridgeOrigin + '/api/records?page=1&pageSize=3');
    return response.status === 200;
  }, 'Python bridge for actual browser');

  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-palette-item')].find(x=>x.querySelector('strong')?.textContent?.includes('数据表格'));if(!e)return false;e.click();return true;})()"), 'P0 table palette action');
  await until(async () => {
    const saved = await stored();
    return Object.values(saved?.decorations ?? {}).some((value) => value?.widgetKind === 'table');
  }, 'P0 table component inserted');
  assert(await evaluate("(() => {const b=document.querySelector('.pa-studio-inspector-rail button[title=内容]');if(!b)return false;if(b.getAttribute('aria-pressed')!=='true')b.click();return true;})()"), 'P0 table content Inspector');
  await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('数据 GET 地址'))?.querySelector('input')"), 'P0 table GET address control');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('数据 GET 地址'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"));
  await call('Input.insertText', { text: bridgeOrigin + '/api/records' });
  await until(async () => Object.values((await stored())?.decorations ?? {}).some((value) => value?.widgetProps?.dataUrl === bridgeOrigin + '/api/records'), 'P0 table bridge URL saved');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P0 AAS-shaped bridge live mode');
  await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('AAS-CI-Model-10')"), 'AAS-shaped native HTTP through bridge -> production Studio UI');
  assert(nativeListCalls > 0, 'Production Studio did not cause any native AAS-shaped HTTP call');
  const aasShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(evidenceDir, 'aas-shaped-http-integration.png'), Buffer.from(aasShot.data, 'base64'));
  writeFileSync(join(evidenceDir, 'aas-shaped-http-integration.json'), JSON.stringify({
    status: 'SYNTHETIC_NATIVE_SHAPE_BROWSER_PASS', platform: process.platform,
    sourceCommit: manifest.sourceCommit, nativeListCalls,
    chain: ['production Chromium Studio /studio', 'Python stdlib AAS P0 bridge', 'synthetic native AAS-shaped HTTP fixture'],
    limitations: ['Native user-supplied AAS source is not in GitHub CI', 'No AAS authentication, CAS/ETag or production user signoff']
  }, null, 2) + '\n');
  pass('production-Studio-Python-bridge-AAS-shaped-HTTP');

  writeFileSync(join(evidenceDir, 'p0-automated.json'), JSON.stringify({
    status: 'AUTOMATED_PASS', sourceCommit: manifest.sourceCommit, platform: process.platform,
    checks: accepted, limitations: [
      'No product-owner or human visual acceptance',
      'No authenticated representative production backend',
      'External generated-app API tests run in separate stable gate'
    ]
  }, null, 2) + '\n');
  console.log(JSON.stringify({ type: 'P0 production editor automatic scenarios', platform: process.platform, checks: accepted }));

  assert.deepEqual(errors, [], 'Unexpected editor JavaScript exceptions');
  console.log(JSON.stringify({ result: 'PASS', revision: manifest.sourceCommit,
    scenario: 'packaged editor / production React / Chromium',
    platform: process.platform,
    checks: ['SHA-256', 'static JS', 'SPA route', '404 fallback', '/create', '/studio', 'runtime errors',
      windows ? 'Windows start-studio.cmd launcher' : 'POSIX node launcher'] }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (aasBridge) {
    if (windows && aasBridge.pid) {
      try { execFileSync('taskkill', ['/PID', String(aasBridge.pid), '/T', '/F'], { stdio: 'ignore' }); }
      catch { aasBridge.kill(); }
    } else { aasBridge.kill(); }
  }
  if (aasFixtureServer) await new Promise((done) => aasFixtureServer.close(done));
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
