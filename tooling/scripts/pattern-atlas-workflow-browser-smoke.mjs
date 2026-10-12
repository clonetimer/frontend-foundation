#!/usr/bin/env node
/**
 * Read-only, isolated Chromium smoke: Studio preview → GET → branch → component event → trace.
 * Requires a running Showcase server and a Chromium executable; it uses a new browser profile,
 * never the user's real Chrome profile or project data.
 *
 * Windows PowerShell example:
 *   $env:CHROMIUM_BIN='C:\Program Files\Google\Chrome\Application\chrome.exe'
 *   pnpm patterns:workflow:browser-smoke
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = (process.env.STUDIO_SMOKE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const chromium = process.env.CHROMIUM_BIN || (process.platform === 'win32' ? 'chrome.exe' : 'chromium');
const port = Number(process.env.STUDIO_SMOKE_CDP_PORT || 9355);
const profile = mkdtempSync(join(tmpdir(), 'studio-workflow-smoke-'));
const fixture = JSON.parse(readFileSync(new URL('../fixtures/pattern-atlas-phase15-smoke.studio.json', import.meta.url), 'utf8'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-proxy-server', '--proxy-bypass-list=*',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 20000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await sleep(130);
  }
  throw new Error(`${label} 超时${last instanceof Error ? `: ${last.message}` : ''}`);
}
async function main() {
  await until(async () => (await fetch(root)).ok, '等待 Showcase', 10000);
  await until(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok, '等待 Chromium CDP', 10000);
  const result = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!result.ok) throw new Error(`CDP 页面创建失败：HTTP ${result.status}`);
  const { webSocketDebuggerUrl } = await result.json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let next = 0; const pending = new Map(); const pageErrors = [];
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data));
    if (payload.method === 'Runtime.exceptionThrown') pageErrors.push(payload.params.exceptionDetails.text);
    const waiter = pending.get(payload.id);
    if (waiter) { pending.delete(payload.id); if (payload.error) waiter.reject(new Error(payload.error.message)); else waiter.resolve(payload.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.text);
    return value.result?.value;
  };
  try {
    await call('Page.enable'); await call('Runtime.enable');
    // The fixture is installed before React initializes, into this ephemeral browser profile.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('foundation-showcase:pattern-atlas:studio-v1', ${JSON.stringify(JSON.stringify(fixture))})` });
    await call('Page.navigate', { url: `${root}/studio` });
    await until(() => evaluate(`!!document.querySelector('[data-studio-component="smokeTrigger"]')`), '设计器渲染');
    // Select button in editor, then open the workflow inspector and switch to live preview.
    await evaluate(`document.querySelector('[data-studio-component="smokeTrigger"]').click(); true`);
    await evaluate(`document.querySelector('.pa-studio-inspector-rail button[title="流程"]').click(); true`);
    const live = await evaluate(`(() => {const radio=[...document.querySelectorAll('.pa-studio-toolbar label')].find(el=>el.textContent?.trim()==='体验'); if(!radio)return false;radio.click();return true;})()`);
    if (!live) throw new Error('无法切换到体验模式');
    await until(() => evaluate(`!!document.querySelector('[data-studio-component="smokeTrigger"] button')`), '体验组件渲染');
    await evaluate(`document.querySelector('[data-studio-component="smokeTrigger"] button').click(); true`);
    await until(() => evaluate(`document.querySelector('[data-studio-component="overviewTitle"]')?.classList.contains('atlas-workflow-highlight')`), '跨组件高亮事件');
    await until(() => evaluate(`document.querySelector('.pa-studio-workflow-log')?.textContent?.includes('completed')`), '执行日志');
    if (pageErrors.length) throw new Error(`浏览器异常：${pageErrors.join('; ')}`);
    const logs = await evaluate(`document.querySelectorAll('.pa-studio-workflow-log li').length`);
    console.log(JSON.stringify({ ok: true, scenario: 'GET → 条件成立 → 跨组件事件 → 执行日志', logs, pageErrors: 0 }, null, 2));
  } finally { ws.close(); }
}
try { await main(); } catch (error) { console.error(error); process.exitCode = 1; }
finally { browser.kill(); rmSync(profile, { recursive: true, force: true }); }
