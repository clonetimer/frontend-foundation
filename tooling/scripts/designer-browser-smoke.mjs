#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const designer = join(root, 'apps/designer');
const dist = join(designer, 'dist');
const vite = join(root, 'node_modules/vite/bin/vite.js');
const chromium = process.env.CHROMIUM_BIN || '/usr/bin/chromium';
const port = Number(process.env.DESIGNER_SMOKE_PORT || 4177);
const debugPort = Number(process.env.DESIGNER_CDP_PORT || 9337);
const externalUrl = process.env.DESIGNER_SMOKE_URL?.trim();
const targetUrl = externalUrl || `http://127.0.0.1:${port}`;
const screenshot = process.env.DESIGNER_SMOKE_SCREENSHOT ? resolve(process.env.DESIGNER_SMOKE_SCREENSHOT) : join(root, 'artifacts/designer-browser-smoke.png');

function fail(message, code = 'DESIGNER_BROWSER_SMOKE_FAILED') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    sleep(2000).then(() => false)
  ]);
  if (exited || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    sleep(1000)
  ]);
}

async function waitFor(fn, timeoutMs, label) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { const value = await fn(); if (value) return value; }
    catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${label} timed out${last ? `: ${last instanceof Error ? last.message : String(last)}` : ''}`);
}

async function openCdp(url) {
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!created.ok) throw new Error(`CDP target creation failed: ${created.status}`);
  const target = await created.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(String(message.data));
    if (data.id && pending.has(data.id)) {
      const { resolve: resolvePending, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message)); else resolvePending(data.result);
    } else if (data.method) events.push(data);
  });
  const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveCall, reject: rejectCall });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, call, events };
}

async function evaluate(call, expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result?.value;
}

async function main() {
  if (!externalUrl && !existsSync(join(dist, 'index.html'))) fail('Designer dist is missing. Run pnpm designer:build first.', 'DESIGNER_DIST_MISSING');
  if (!externalUrl && !existsSync(vite)) fail(`Vite binary not found at ${vite}`, 'DESIGNER_VITE_MISSING');
  if (!existsSync(chromium)) fail(`Chromium binary not found at ${chromium}`, 'DESIGNER_CHROMIUM_MISSING');
  mkdirSync(dirname(screenshot), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'foundation-designer-chromium-'));
  const preview = externalUrl ? undefined : spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: designer, stdio: ['ignore', 'pipe', 'pipe'] });
  const browser = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    if (!externalUrl) {
      await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${port}`);
        return response.ok;
      }, 10000, 'Designer preview');
    }
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return response.ok;
    }, 10000, 'Chromium DevTools');

    const cdp = await openCdp(targetUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Page.navigate', { url: targetUrl });
    await waitFor(async () => {
      const state = await evaluate(cdp.call, 'document.readyState');
      return state === 'complete';
    }, 10000, 'Designer document load');
    await sleep(500);
    const bodyText = String(await evaluate(cdp.call, 'document.body.innerText'));
    if (/organization.*doesn.?t allow|blocked by your administrator|ERR_BLOCKED_BY_ADMINISTRATOR/i.test(bodyText)) {
      fail(`Chromium policy blocked Designer navigation to ${targetUrl}.`, 'BROWSER_POLICY_BLOCKED');
    }
    if (!bodyText.includes('Foundation Visual Designer')) fail('Designer shell did not render in Chromium.');

    const before = Number(await evaluate(cdp.call, 'document.querySelectorAll("[data-foundation-node]").length'));
    const added = await evaluate(cdp.call, `(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Add'); if (!button) return false; button.click(); return true; })()`);
    if (!added) fail('Could not find a Palette Add button.');
    await sleep(150);
    const afterAdd = Number(await evaluate(cdp.call, 'document.querySelectorAll("[data-foundation-node]").length'));
    if (!(afterAdd > before)) fail(`Palette Add did not increase canvas node count (${before} -> ${afterAdd}).`);

    const undone = await evaluate(cdp.call, `(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Undo'); if (!button || button.disabled) return false; button.click(); return true; })()`);
    if (!undone) fail('Undo was unavailable after Palette Add.');
    await sleep(150);
    const afterUndo = Number(await evaluate(cdp.call, 'document.querySelectorAll("[data-foundation-node]").length'));
    if (afterUndo !== before) fail(`Undo did not restore canvas node count (${afterUndo} != ${before}).`);

    const mobile = await evaluate(cdp.call, `(() => { const target = [...document.querySelectorAll('*')].find((entry) => entry.children.length === 0 && entry.textContent?.trim() === 'Mobile'); if (!target) return false; target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
    if (!mobile) fail('Mobile viewport control was not found.');
    await sleep(150);

    const capture = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));
    cdp.ws.close();
    console.log(JSON.stringify({ ok: true, mode: externalUrl ? 'external' : 'local', url: targetUrl, before, afterAdd, afterUndo, screenshot }, null, 2));
  } finally {
    await terminate(preview);
    await terminate(browser);
    let cleanupError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        cleanupError = undefined;
        break;
      } catch (error) {
        cleanupError = error;
        await sleep(150 * (attempt + 1));
      }
    }
    if (cleanupError) console.warn(`Designer Chromium profile cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, code: error.code ?? 'DESIGNER_BROWSER_SMOKE_FAILED', message: error.message }, null, 2));
  process.exitCode = 1;
});
