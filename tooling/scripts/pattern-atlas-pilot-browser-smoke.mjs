#!/usr/bin/env node
/**
 * Optional dependency-free Chromium smoke test, requires a running Showcase dev server.
 * PILOT_SMOKE_URL=http://127.0.0.1:5173 pnpm patterns:pilot:browser-smoke
 * Uses a fresh Chromium profile and only reads/changes per-profile localStorage.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = (process.env.PILOT_SMOKE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const chromium = process.env.CHROMIUM_BIN || '/usr/bin/chromium';
const cdpPort = Number(process.env.PILOT_SMOKE_CDP_PORT || 9344);
const profile = mkdtempSync(join(tmpdir(), 'pattern-atlas-pilot-smoke-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-proxy-server', '--proxy-bypass-list=*',
  `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

async function waitUntil(check, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try { const result = await check(); if (result) return result; }
    catch (error) { last = error; }
    await sleep(140);
  }
  throw new Error(`浏览器等待超时${last instanceof Error ? `: ${last.message}` : ''}`);
}
async function connect(url) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`无法创建 Chromium CDP 页面：${response.status}`);
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(String(event.data));
    if (pending.has(result.id)) {
      const { resolve, reject } = pending.get(result.id);
      pending.delete(result.id);
      if (result.error) reject(new Error(result.error.message)); else resolve(result.result);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, call };
}
async function evalIn(call, expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error('Chromium evaluate: ' + result.exceptionDetails.text);
  return result.result?.value;
}

async function main() {
  await waitUntil(async () => (await fetch(root)).ok, 10000);
  await waitUntil(async () => (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok, 10000);
  const { ws, call } = await connect(`${root}/records`);
  try {
    await call('Page.enable'); await call('Runtime.enable');
    async function visit(path) {
      await call('Page.navigate', { url: `${root}${path}` });
      await waitUntil(() => evalIn(call, 'document.readyState === "complete"'));
      await waitUntil(() => evalIn(call, 'Boolean(document.querySelector("#root")?.textContent?.trim())'));
    }
    async function click(label) {
      return evalIn(call, `(() => {
        const label = ${JSON.stringify(label)};
        const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === label);
        if (!button || button.disabled) return false;
        button.click(); return true;
      })()`);
    }
    async function active() { return Boolean(await evalIn(call, 'Boolean(document.querySelector(".pa-pilot-themed[data-variant=live]"))')); }
    await visit('/records');
    if (await active()) throw new Error('新浏览器配置中 Records 未默认恢复原版');
    await visit('/records/pilot');
    await waitUntil(() => evalIn(call, 'document.body.textContent.includes("候选设计") && document.querySelectorAll(".pa-pilot-compare .ant-table").length === 2 && [...document.querySelectorAll(".pa-pilot-compare .ant-table tbody")].every(el => el.textContent.includes("REC-"))'));
    const sameIds = await evalIn(call, `(() => {
      const tables = [...document.querySelectorAll('.pa-pilot-compare .ant-table')];
      const lines = tables.map(t => [...t.querySelectorAll('tbody tr')].map(tr => tr.innerText));
      return lines[0]?.length > 0 && JSON.stringify(lines[0]) === JSON.stringify(lines[1]);
    })()`);
    if (!sameIds) throw new Error('原版与候选版展示的数据不一致');
    if (!await click('保存候选版本')) throw new Error('找不到保存候选版本按钮');
    await sleep(250);
    await visit('/records');
    if (await active()) throw new Error('仅保存候选版本意外启用了试点');
    await visit('/records/pilot');
    if (!await click('保存并启用到 Records')) throw new Error('找不到启用按钮');
    await waitUntil(() => evalIn(call, 'document.body.textContent.includes("已启用")'));
    await visit('/records');
    await waitUntil(active);
    if (!await click('恢复原版')) throw new Error('找不到恢复原版按钮');
    await waitUntil(async () => !(await active()));
    await visit('/records/pilot');
    const history = await evalIn(call, 'document.querySelectorAll(".pa-pilot-revision").length');
    if (history < 2) throw new Error('关闭试点后版本历史意外丢失');
    console.log(JSON.stringify({ ok: true, url: root, check: ['original-by-default', 'same-records-data', 'save-without-publish', 'explicit-publish', 'rollback-to-original', 'history-retained'], revisions: history }, null, 2));
  } finally { ws.close(); }
}

try { await main(); }
catch (error) { console.error('Pilot browser smoke failed:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally {
  browser.kill('SIGTERM');
  await sleep(500);
  if (browser.exitCode === null) browser.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
  catch (error) { console.warn('Disposable browser profile cleanup:', String(error)); }
}
