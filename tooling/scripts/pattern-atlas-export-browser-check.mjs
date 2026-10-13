#!/usr/bin/env node
/**
 * Real Chromium acceptance for the standalone ZIP produced by Pattern Atlas.
 * Launches the built Vite project (outside the Foundation workspace), verifies
 * modal/drawer/popconfirm interactions, and checks a signed multi-series chart.
 * Uses Node's built-in WebSocket client and a disposable Chrome profile.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
  const posts = [];
  const savedRecords = [{ id:'R/1 ?', name:'旧姓名', email:'old@example.org', amount:3 }];
  const patchCalls = [];
  const followupCalls = [];
  let listReads = 0;
  const api = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4189');
    response.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.method === 'GET' && request.url === '/api/list') { listReads += 1; response.writeHead(200); response.end(JSON.stringify({data:{items:savedRecords}})); return; }
    if (request.method !== 'POST' && request.method !== 'PATCH') { response.writeHead(405); response.end('{}'); return; }
    let body = '';
    for await (const chunk of request) {
      body += String(chunk);
      if (body.length > 4096) { response.writeHead(413); response.end('{}'); return; }
    }
    if (request.method === 'PATCH' && request.url === '/api/edit/R%2F1%20%3F') {
      const submitted = JSON.parse(body);
      patchCalls.push({ path:request.url, data:submitted });
      Object.assign(savedRecords[0], submitted);
      response.writeHead(200); response.end('{"saved":true}'); return;
    }
    if (request.method === 'POST' && request.url === '/api/followup') {
      followupCalls.push(JSON.parse(body));
      response.writeHead(200); response.end('{"ok":true}'); return;
    }
    if (request.url === '/api/fail') { response.writeHead(500); response.end('{"error":"intentional test failure"}'); return; }
    if (request.url !== '/api/save') { response.writeHead(404); response.end('{}'); return; }
    const posted = JSON.parse(body);
    posts.push(posted);
    savedRecords.push({ id:'R-' + (savedRecords.length + 1), name: posted.name, email: posted.email, amount: posted.amount });
    response.writeHead(201); response.end('{"saved":true}');
  });
  const errors = [];
  try {
    await new Promise((resolve, reject) => { api.once('error', reject); api.listen(4198, '127.0.0.1', resolve); });
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
    await until(() => evaluate("!!document.querySelector('[data-atlas-chart-source=remote]')"), 'Remote chart initial GET');
    const chart = await evaluate("(() => { const svg = [...document.querySelectorAll('svg[role=img]')].find(el => el.getAttribute('aria-label')?.includes('验收多序列曲线')); return svg ? { label: svg.getAttribute('aria-label'), paths: svg.querySelectorAll('polyline').length, points: svg.querySelectorAll('circle').length } : null; })()");
    assert(chart, 'Exported chart was not rendered');
    assert(chart.label.includes('-35') && chart.label.includes('280'), 'Signed remote chart values lost');
    assert.equal(chart.paths, 2, 'Multi-series chart paths missing');
    assert(chart.points >= 6, 'Data point hover markers missing');
    writeFileSync(join(directory, 'dist', 'chart-feed.json'), JSON.stringify({
      data: { items: ['A', 'B', 'C'], series: [
        { name:'温度', values:[-70, 30, 360] }, { name:'参考', values:[0, 15, 40] }
      ] }
    }), 'utf8');
    const refresh = await evaluate("(() => { const root = document.querySelector('.pa-studio-chart-remote'); const button = [...(root?.querySelectorAll('button') || [])].find(el => el.textContent?.includes('刷新数据')); if (!button) return false; button.click(); return true; })()");
    assert(refresh, 'Chart refresh control not available in standalone export');
    await until(() => evaluate("(() => { const svg = document.querySelector('.pa-studio-chart-remote svg[role=img]'); const label = svg?.getAttribute('aria-label') || ''; return label.includes('-70') && label.includes('360'); })()"), 'Remote chart refresh GET');


    assert(await click('打开验收弹窗'), 'Modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('验收弹窗内容')"), 'Modal open');
    console.log('Modal DOM diagnostics:', await evaluate("JSON.stringify([...document.querySelectorAll('.ant-modal-footer button')].map(el => ({ text: el.textContent, disabled: el.disabled, html: el.outerHTML.slice(0, 260) })))"));
    const modalCancel = await until(() => evaluate("(() => { const buttons = [...document.querySelectorAll('.ant-modal-footer button')]; const button = buttons.find(el => el.textContent?.trim().includes('取消')) || buttons.find(el => !el.classList.contains('ant-btn-primary')); if (!button) return false; button.click(); return true; })()"), 'Modal cancel button');
    assert(modalCancel, 'Modal cancel button missing');
    await until(() => evaluate("!document.querySelector('.ant-modal') || !document.querySelector('.ant-modal').closest('.ant-modal-root')?.querySelector('.ant-modal-wrap') || getComputedStyle(document.querySelector('.ant-modal-wrap')).display === 'none'"), 'Modal close');

    assert(await click('打开验收抽屉'), 'Drawer trigger missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body')?.textContent?.includes('验收抽屉内容')"), 'Drawer open');
    await evaluate("document.querySelector('.ant-drawer-close')?.click()");
    await until(() => evaluate("!document.querySelector('.ant-drawer-content-wrapper') || getComputedStyle(document.querySelector('.ant-drawer-content-wrapper')).transform !== 'none'"), 'Drawer close');

    assert(await click('执行验收确认'), 'Popconfirm trigger missing');
    await until(() => evaluate("document.querySelector('.ant-popconfirm-inner-content')?.textContent?.includes('验收提示')"), 'Popconfirm open');
    const popConfirmed = await until(() => evaluate("(() => { const button = document.querySelector('.ant-popconfirm-buttons button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Popconfirm primary action');
    assert(popConfirmed, 'Popconfirm confirmation missing');
    await until(() => evaluate("document.body.textContent.includes('操作已确认（未关联后端）')"), 'Popconfirm feedback');


    // Exercise the real POST operation and schema validation in the exported React app.
    await evaluate("window.addEventListener('atlas:records-refresh', () => { document.documentElement.dataset.recordRefresh = 'done'; })");
    const fill = async (scope, name, value) => {
      const focus = await evaluate("(() => { const field = [...document.querySelectorAll(" + JSON.stringify(scope + ' input') + ")].find(el => el.getAttribute('aria-label') === " + JSON.stringify(name) + "); if (!field) return false; field.focus(); return true; })()");
      assert(focus, 'Missing form input: ' + name);
      await call('Input.insertText', { text: value });
    };
    assert(await click('填写新增记录'), 'Business modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('新增记录表单')"), 'Business modal open');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-modal-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Business modal save button missing');
    await until(() => evaluate("document.querySelector('.ant-modal [role=alert]')?.textContent?.includes('此项必填')"), 'Business modal required validation');
    assert.equal(posts.length, 0, 'Invalid form unexpectedly sent a POST');
    await fill('.ant-modal', '姓名', '张三');
    await fill('.ant-modal', '邮箱', 'valid@example.org');
    await fill('.ant-modal', '金额', '12.5');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-modal-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Business modal submit missing');
    await until(() => posts.length === 1, 'Actual form POST');
    assert.deepEqual(posts[0], { name: '张三', email: 'valid@example.org', amount: 12.5 }, 'Incorrect JSON POST payload');
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('张三')"), 'Actual record-list GET after business POST');
    assert(listReads >= 2, 'POST success did not cause a real list GET refresh');
    await until(() => evaluate("document.documentElement.dataset.recordRefresh === 'done'"), 'Record refresh notification');
    await until(() => evaluate("document.body.textContent.includes('保存成功，记录已刷新')"), 'Business form success feedback');
    await until(() => evaluate("document.body.textContent.includes('条件命中：张三')"), 'Conditional success branch notification');
    await until(() => evaluate("document.querySelector('[data-studio-component=formList21]')?.classList.contains('atlas-workflow-highlight')"), 'Success workflow component highlight');


    assert(await click('打开错误示例'), 'Business drawer trigger missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body')?.textContent?.includes('失败反馈表单') || document.querySelector('.ant-drawer-body')?.textContent?.includes('模拟服务端失败')"), 'Business drawer open');
    await fill('.ant-drawer-body', '姓名', '测试失败');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-drawer-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Business drawer submit missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body [role=alert]')?.textContent?.includes('HTTP 500')"), 'Business drawer HTTP error');
    await until(() => evaluate("document.body.textContent.includes('提交失败分支执行')"), 'Failure workflow notification');
    assert(await evaluate("Boolean(document.querySelector('.ant-drawer-body input[aria-label=姓名]'))"), 'Failed form unexpectedly closed or lost draft');
    await evaluate("document.querySelector('.ant-drawer-footer button.ant-btn-default')?.click()");

    // Phase 21-B: the exported overlay obtains current record context from
    // StudioRecordProvider and freezes the shared source URL during export.
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('旧姓名')"), 'Existing selection rendered');
    assert(await click('编辑当前记录'), 'Selected-record edit modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('编辑选中记录')"), 'Selected-record modal open');
    const previous = await evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value");
    assert.equal(previous, '旧姓名', 'Edit modal did not prefill selected record');
    assert(await evaluate("(() => { const field = document.querySelector('.ant-modal input[aria-label=姓名]'); if (!field) return false; field.focus(); field.select(); return true; })()"), 'Edit input not found');
    await call('Input.insertText', { text: '更新姓名' });
    await until(() => evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value === '更新姓名'"), 'Edit field changed');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-modal-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Edit save button missing');
    await until(() => patchCalls.length === 1, 'Real PATCH with encoded selected ID');
    assert.deepEqual(patchCalls[0], { path:'/api/edit/R%2F1%20%3F', data:{name:'更新姓名'} }, 'Selected record was not safely targeted');
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('更新姓名')"), 'Record list GET after edit PATCH');


    // Phase 21-C: a successful save can request explicit authorization before
    // a second backend mutation. The second request may use the submitted draft.
    assert(await click('提交并执行后续请求'), 'Follow-up workflow modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('接口联动表单')"), 'Follow-up form open');
    await fill('.ant-modal', '姓名', '后续任务');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-modal-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Follow-up form submit missing');
    await until(() => evaluate("document.querySelector('.ant-modal-confirm')?.textContent?.includes('允许执行后续业务请求')"), 'Follow-up request confirmation');
    assert.equal(followupCalls.length, 0, 'Follow-up mutation ran before explicit confirmation');
    await evaluate("document.querySelector('.ant-modal-confirm-btns button.ant-btn-primary')?.click()");
    await until(() => followupCalls.length === 1, 'Explicitly approved follow-up API POST');
    assert.deepEqual(followupCalls[0], { name:'后续任务' }, 'Follow-up request did not interpolate form fields');
    await until(() => evaluate("document.body.textContent.includes('后续操作成功')"), 'Follow-up workflow notification');

    assert.equal(errors.length, 0, 'Browser runtime exceptions: ' + errors.join('; '));
    const snapshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (process.env.GITHUB_WORKSPACE && snapshot.data) {
      const artifacts = join(process.env.GITHUB_WORKSPACE, 'artifacts');
      mkdirSync(artifacts, { recursive: true });
      writeFileSync(join(artifacts, 'pattern-atlas-export-browser.png'), Buffer.from(snapshot.data, 'base64'));
    }
    console.log(JSON.stringify({ result: 'PASS', scenario: 'standalone-zip/Chromium', checks: ['React mount', 'signed two-series chart', 'live chart GET and refresh', 'modal cancel', 'drawer close', 'popconfirm confirm', 'overlay form POST/validation/error/refresh', 'record-list real GET refetch', 'selected record PATCH and linked source', 'success/failure workflow branching', 'component emit', 'explicitly confirmed follow-up POST', 'no runtime errors'] }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    chrome?.kill();
    vite.kill();
    await new Promise((resolve) => api.close(resolve));
    await pause(450);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
    catch (error) { console.warn('Could not fully delete disposable Chrome profile:', String(error)); }
  }
}
