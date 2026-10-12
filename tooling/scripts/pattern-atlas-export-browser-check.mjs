#!/usr/bin/env node
/**
 * Real Chromium acceptance for the standalone ZIP produced by Pattern Atlas.
 * Launches the built Vite project (outside the Foundation workspace), verifies
 * modal/drawer/popconfirm interactions, and checks a signed multi-series chart.
 * Uses Node's built-in WebSocket client and a disposable Chrome profile.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, name, limit = 30000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < limit) {
    try { const answer = await check(); if (answer) return answer; }
    catch (error) { last = error; }
    await pause(180);
  }
  throw new Error(name + ' timed out' + (last ? ': ' + String(last) : ''));
}
export async function runExportedBrowserSmoke(directory) {
  const root = 'http://127.0.0.1:4189';
  const port = 9377;
  const profile = mkdtempSync(join(tmpdir(), 'atlas-export-chrome-'));
  const vite = spawn(process.execPath, [join(directory, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { cwd: directory, stdio: 'ignore' });
  let chrome;
  let socket;
  const errors = [];
  try {
    await until(async () => (await fetch(root)).ok, 'Exported Vite preview');
    chrome = spawn(process.env.CHROMIUM_BIN || 'google-chrome', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
      '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });
    await until(async () => (await fetch('http://127.0.0.1:' + port + '/json/version')).ok, 'Chromium DevTools');
    const created = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
    assert.equal(created.status, 200, 'Chromium tab create failed');
    const tab = await created.json();
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let seq = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(String(event.data));
      if (data.method === 'Runtime.exceptionThrown') errors.push(data.params?.exceptionDetails?.text ?? 'Browser runtime exception');
      const promise = pending.get(data.id);
      if (promise) {
        pending.delete(data.id);
        if (data.error) promise.reject(new Error(data.error.message));
        else promise.resolve(data.result);
      }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const out = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
      return out.result?.value;
    };
    const click = (label) => evaluate("(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === " + JSON.stringify(label) + "); if (!button) return false; button.click(); return true; })()");
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: root + '/#/overview' });
    await until(() => evaluate("document.querySelector('main')?.textContent?.includes('验收多序列曲线')"), 'Exported React mount');
    const chart = await evaluate("(() => { const svg = [...document.querySelectorAll('svg[role=img]')].find(el => el.getAttribute('aria-label')?.includes('验收多序列曲线')); return svg ? { label: svg.getAttribute('aria-label'), paths: svg.querySelectorAll('polyline').length, points: svg.querySelectorAll('circle').length } : null; })()");
    assert(chart, 'Exported chart was not rendered');
    assert(chart.label.includes('-20') && chart.label.includes('120'), 'Signed chart values lost');
    assert.equal(chart.paths, 2, 'Multi-series chart paths missing');
    assert(chart.points >= 6, 'Data point hover markers missing');

    assert(await click('打开验收弹窗'), 'Modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('验收弹窗内容')"), 'Modal open');
    assert(await click('取消'), 'Modal cancel button missing');
    await until(() => evaluate("!document.querySelector('.ant-modal') || !document.querySelector('.ant-modal').closest('.ant-modal-root')?.querySelector('.ant-modal-wrap') || getComputedStyle(document.querySelector('.ant-modal-wrap')).display === 'none'"), 'Modal close');

    assert(await click('打开验收抽屉'), 'Drawer trigger missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body')?.textContent?.includes('验收抽屉内容')"), 'Drawer open');
    await evaluate("document.querySelector('.ant-drawer-close')?.click()");
    await until(() => evaluate("!document.querySelector('.ant-drawer-content-wrapper') || getComputedStyle(document.querySelector('.ant-drawer-content-wrapper')).transform !== 'none'"), 'Drawer close');

    assert(await click('执行验收确认'), 'Popconfirm trigger missing');
    await until(() => evaluate("document.querySelector('.ant-popconfirm-inner-content')?.textContent?.includes('验收提示')"), 'Popconfirm open');
    assert(await click('确认'), 'Popconfirm confirmation missing');
    await until(() => evaluate("document.body.textContent.includes('操作已确认（未关联后端）')"), 'Popconfirm feedback');

    assert.equal(errors.length, 0, 'Browser runtime exceptions: ' + errors.join('; '));
    const snapshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (process.env.GITHUB_WORKSPACE && snapshot.data) {
      const artifacts = join(process.env.GITHUB_WORKSPACE, 'artifacts');
      mkdirSync(artifacts, { recursive: true });
      writeFileSync(join(artifacts, 'pattern-atlas-export-browser.png'), Buffer.from(snapshot.data, 'base64'));
    }
    console.log(JSON.stringify({ result: 'PASS', scenario: 'standalone-zip/Chromium', checks: ['React mount', 'signed two-series chart', 'modal cancel', 'drawer close', 'popconfirm confirm', 'no runtime errors'] }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    chrome?.kill();
    vite.kill();
    await pause(450);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
    catch (error) { console.warn('Could not fully delete disposable Chrome profile:', String(error)); }
  }
}
