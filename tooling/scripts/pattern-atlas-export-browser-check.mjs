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
import { launchChromiumCdp } from './chromium-cdp-start.mjs';

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
  const mappedPosts = [];
  const legacySaveCalls = [];
  let mappedCommitThen503 = false;
  const savedRecords = [{ id:'R/1 ?', name:'旧姓名', email:'old@example.org', amount:3 }];
  const tableCalls = [];
  const tableRows = [
    {id:'R/1 ?',name:'旧姓名',status:'进行中',etag:'"v1"'},
    {id:'T-2',name:'第二对象',status:'待开始',etag:'"v1"'},
    {id:'T-3',name:'可查对象',status:'已完成',etag:'"v1"'},
    {id:'T-4',name:'另一对象',status:'进行中',etag:'"v1"'}
  ];
  const patchCalls = [];
  const followupCalls = [];
  const detailCalls = [];
  const deleteCalls = [];
  const deleteHeaders = [];
  let commitThen503Id = '';
  let rejectFirstDelete = true;
  let failNextBatchDeleteId = '';
  let listReads = 0;
  // Deterministic fault injection for exported-table detail request races/recovery.
  let slowNextDetailId = '';
  let failNextDetailId = '';
  const api = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4189');
    response.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.method === 'GET' && request.url?.startsWith('/api/row/')) {
      detailCalls.push(request.url);
      const id = decodeURIComponent(request.url.slice('/api/row/'.length));
      const row = tableRows.find((record) => record.id === id);
      if (!row) { response.writeHead(404); response.end('{}'); return; }
      if (slowNextDetailId === id) { slowNextDetailId = ''; await pause(1200); }
      if (failNextDetailId === id) { failNextDetailId = ''; response.writeHead(503); response.end('{"error":"temporary detail failure"}'); return; }
      response.writeHead(200);
      response.end(JSON.stringify({data: id === 'T-4'
        ? {id:'wrong-record',name:'非法错误详情'}
        : id === 'T-3'
          ? {...row,name:'不应显示的详情字段',alias:{name:'详情'+row.name},email:'detail@example.org'}
          : {...row,name:'详情'+row.name,email:'detail@example.org'}}));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/api/table')) {
      const query = new URL(request.url, 'http://127.0.0.1:4198');
      const values = Object.fromEntries(query.searchParams);
      tableCalls.push(values);
      let records = [...tableRows];
      const search = (query.searchParams.get('search') ?? '').trim();
      if (search) records = records.filter((item) => item.name.includes(search));
      if (query.searchParams.get('view') === 'shared' && query.searchParams.get('state')) {
        records = records.filter((item) => item.status === query.searchParams.get('state'));
      } else if (query.searchParams.get('filterField') === 'status' && query.searchParams.get('filter')) {
        records = records.filter((item) => item.status === query.searchParams.get('filter'));
      }
      if (query.searchParams.get('sort') === 'name' && query.searchParams.get('order')) {
        records.sort((a, b) => a.name.localeCompare(b.name) * (query.searchParams.get('order') === 'desc' ? -1 : 1));
      }
      const page = Math.max(1, Number(query.searchParams.get('page') || '1'));
      const pageSize = Math.max(1, Math.min(20, Number(query.searchParams.get('pageSize') || '2')));
      response.writeHead(200); response.end(JSON.stringify({data:{
        items: records.slice((page - 1) * pageSize, page * pageSize).map((record) =>
          query.searchParams.get('view') === 'shared' ? {...record, name:'不应显示的原始字段', alias:{name:record.name}} : record),
        total: records.length
      }})); return;
    }
    if (request.method === 'DELETE' && request.url?.startsWith('/api/delete/')) {
      deleteCalls.push(request.url);
      deleteHeaders.push({url: request.url, etag: request.headers['if-match'] ?? ''});
      const id = decodeURIComponent(request.url.slice('/api/delete/'.length));
      const index = tableRows.findIndex((row) => row.id === id);
      if (index < 0) { response.writeHead(404); response.end('{}'); return; }
      if (request.headers['if-match'] !== tableRows[index].etag) { response.writeHead(412); response.end('{"error":"etag conflict"}'); return; }
      if (commitThen503Id === id) {
        commitThen503Id = '';
        tableRows.splice(index, 1);
        response.writeHead(503); response.end('{"error":"write committed but proxy returned 503"}'); return;
      }
      if (request.url === '/api/delete/' + failNextBatchDeleteId && failNextBatchDeleteId) {
        failNextBatchDeleteId = '';
        response.writeHead(403); response.end('{"error":"permission denied"}'); return;
      }
      if (request.url === '/api/delete/T-3' && rejectFirstDelete) {
        rejectFirstDelete = false;
        response.writeHead(403); response.end('{"error":"permission denied"}'); return;
      }
      tableRows.splice(index, 1);
      response.writeHead(204); response.end(); return;
    }
    if (request.method === 'GET' && request.url === '/api/list') { listReads += 1; response.writeHead(200); response.end(JSON.stringify({data:{items:savedRecords}})); return; }
    if (request.method !== 'POST' && request.method !== 'PATCH') { response.writeHead(405); response.end('{}'); return; }
    let body = '';
    for await (const chunk of request) {
      body += String(chunk);
      if (body.length > 4096) { response.writeHead(413); response.end('{}'); return; }
    }
    if (request.method === 'PATCH' && request.url === '/api/edit/T-3') {
      const submitted = JSON.parse(body);
      patchCalls.push({ path:request.url, data:submitted });
      Object.assign(tableRows[2], submitted);
      response.writeHead(200); response.end('{"saved":true}'); return;
    }
    if (request.method === 'PATCH' && request.url === '/api/edit/R%2F1%20%3F') {
      const submitted = JSON.parse(body);
      patchCalls.push({ path:request.url, data:submitted });
      Object.assign(savedRecords[0], submitted);
      Object.assign(tableRows[0], submitted);
      response.writeHead(200); response.end('{"saved":true}'); return;
    }
    if (request.method === 'POST' && request.url === '/api/mapped-create') {
      const record = JSON.parse(body);
      mappedPosts.push(record);
      if (record.subject === '字段不合格') {
        response.writeHead(422); response.end('{"errors":{"subject":["服务器要求更正姓名"],"__proto__":["unsafe"]}}'); return;
      }
      if (record.subject === '权限拒绝') {
        response.writeHead(403); response.end('{"error":"not authorized"}'); return;
      }
      if (mappedCommitThen503) {
        mappedCommitThen503 = false;
        response.writeHead(503); response.end('{"error":"committed but gateway returned 503"}'); return;
      }
      response.writeHead(201); response.end('{"saved":true}'); return;
    }
    if (request.method === 'POST' && request.url === '/api/legacy-record-save') {
      legacySaveCalls.push(JSON.parse(body));
      if (legacySaveCalls.length === 1) {
        response.writeHead(422); response.end('{"errors":{"name":["记录字段服务端校验错误"],"__proto__":"unsafe"}}'); return;
      }
      if (legacySaveCalls.length === 2) {
        response.writeHead(503); response.end('{"error":"already committed but gateway failed"}'); return;
      }
      if (legacySaveCalls.length === 3) {
        response.writeHead(403); response.end('{"error":"denied"}'); return;
      }
      // C6: persist the non-first record to exercise server-authoritative refresh.
      if (legacySaveCalls.length >= 5 && savedRecords[1]) Object.assign(savedRecords[1], legacySaveCalls.at(-1));
      await new Promise((resolve) => setTimeout(resolve, 350));
      response.writeHead(200); response.end('{"saved":true}'); return;
    }
    if (request.method === 'POST' && request.url === '/api/followup') {
      followupCalls.push(JSON.parse(body));
      response.writeHead(200); response.end('{"ok":true}'); return;
    }
    if (request.url === '/api/fail') { response.writeHead(400); response.end('{"error":"definite validation rejection"}'); return; }
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
    chrome = await launchChromiumCdp({
      executable: process.env.CHROMIUM_BIN || 'google-chrome',
      port, profileRoot: profile
    });
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
      // A stalled DevTools response must fail the gate rather than hang until
      // the outer CI job timeout, which hides the actual browser assertion.
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome CDP ' + method + ' timed out on ' + String(params.expression ?? params.url ?? '').slice(0, 280))); }, 30000);
      pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(reason) { clearTimeout(timer); reject(reason); }
      });
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
    // P5-R3c2b1: test the *actual built ZIP* from its production Vite origin.
    // Dormant modules must load only via an explicit import; reject any
    // request without runtime-only trusted host approval/session hooks.
    const p5Before = { posts: posts.length, mappedPosts: mappedPosts.length,
      patchCalls: patchCalls.length, deleteCalls: deleteCalls.length };
    const portable = await evaluate("(async () => {"
      + "const mod=await import('/p5-reference/p5_r3c2_runtime_adapter.mjs');"
      + "const ineligible=mod.p5R3c2SourceIsEligible({id:'imported',idempotent:true,saveUrl:'/api/tasks/1'});"
      + "const browser={location:globalThis.location,navigator:globalThis.navigator,localStorage:globalThis.localStorage};"
      + "let missingHostRefused=false;"
      + "try{mod.createP5R3c2ReferenceAdapter({host:{origin:globalThis.location.origin},browser})}"
      + "catch(e){missingHostRefused=String(e).includes('trusted nonserializable host hooks')}"
      + "const adapter=mod.createP5R3c2ReferenceAdapter({"
      + "host:{origin:globalThis.location.origin,getApproval:async()=>false,"
      + "getSession:async()=>{throw Error('Unexpected auth request')}},browser});"
      + "let denied=false;"
      + "try{await adapter.begin({recordId:1,status:'approved',key:'p5_zip_browser_no_write_001'})}"
      + "catch(e){denied=String(e).includes('approval required')}"
      + "return {kind:adapter.kind,defaultOn:adapter.enabledByDefault,"
      + "ineligible,missingHostRefused,denied,begin:typeof adapter.begin,"
      + "check:typeof adapter.check,replay:typeof adapter.replay};"
      + "})()");
    assert.deepEqual(portable, { kind:'synthetic-reference-only',defaultOn:false,
      ineligible:false,missingHostRefused:true,denied:true,
      begin:'function',check:'function',replay:'function' },
    'Standalone Vite browser failed to load shared adapter or enforced implicit write');
    assert.deepEqual({posts:posts.length,mappedPosts:mappedPosts.length,
      patchCalls:patchCalls.length,deleteCalls:deleteCalls.length},p5Before,
    'Importing dormant P5 reference source caused business mutation');
    console.log('P5-R3c2b1: production standalone ZIP browser imported optional module; no write authorized');
    // P5-R3c2b2: execute the *actual exported* ESM runtime in Chromium.
    // Its network fixture is in-memory and synthetic; production mutations stay
    // untouched. R3b2b separately exercises real HTTP + disposable SQLite.
    const portableRecovery = await evaluate(`(async () => {
      const mod = await import('/p5-reference/p5_r3c2_runtime_adapter.mjs');
      const origin = globalThis.location.origin;
      const journalKey = 'foundation:p5-r3c:synthetic-pending:v1';
      if (globalThis.localStorage.getItem(journalKey) !== null) {
        throw Error('ZIP P5 synthetic test found an unexpected pending journal');
      }
      const key = 'p5_zip_browser_recovery_00002';
      const etag = String.fromCharCode(34) + 'a'.repeat(64) + String.fromCharCode(34);
      const csrf = 'synthetic-only-csrf-' + 'c'.repeat(40);
      let actor = {tenantId:'tenant-a', subjectId:'alice',
        sessionEpoch:'11111111-1111-4111-8111-111111111111', role:'writer'};
      const capability = {contract:'foundation.idempotent-write/v1',
        providerId:'22222222-2222-4222-8222-222222222222',
        receiptEpoch:'33333333-3333-4333-8333-333333333333',
        scope:{tenantId:'tenant-a',subjectId:'alice'},
        guarantees:{atomicMutationAndReceipt:true,sameKeySameIntentReplay:true,
          authenticatedReceiptLookup:true,principalScopedKeys:true,conditionalMutation:true},
        minReceiptRetentionSeconds:604800,
        routes:[{method:'PATCH',path:'/api/tasks/{id}',receiptPath:'/api/mutations/{key}'}]};
      let writes = 0, receiptReads = 0, committed = false;
      const response = (status, value, extra={}) => new Response(JSON.stringify(value), {
        status, headers:{'content-type':'application/json','cache-control':'no-store',...extra}
      });
      const fetchImpl = async (url, options) => {
        if (!url.startsWith(origin + '/') || options.credentials !== 'same-origin'
          || options.redirect !== 'error' || options.cache !== 'no-store') {
          throw Error('P5 ZIP synthetic transport escaped same-origin requirements');
        }
        if (url === origin+'/api/session' && options.method === 'GET') {
          return response(200,{identity:actor,csrfToken:csrf});
        }
        if (url === origin+'/.well-known/foundation-idempotent-write/v1'
          && options.method === 'GET') return response(200,capability);
        if (url === origin+'/api/tasks/1' && options.method === 'GET') {
          return response(200,{data:{id:1,tenant_id:'tenant-a',status:'draft',version:1}},
            {etag});
        }
        if (url === origin+'/api/tasks/1' && options.method === 'PATCH') {
          if (options.headers['Idempotency-Key'] !== key
            || options.headers['If-Match'] !== etag
            || options.headers['X-P5-CSRF-Token'] !== csrf
            || options.body !== JSON.stringify({status:'approved'})
            || JSON.parse(globalThis.localStorage.getItem(journalKey) || 'null')?.key !== key) {
            throw Error('P5 ZIP request not journaled before original-key PATCH');
          }
          writes += 1;
          committed = true;
          return response(503,{error:'synthetic commit followed by lost response'});
        }
        if (url === origin+'/api/mutations/'+key && options.method === 'GET') {
          receiptReads += 1;
          return committed ? response(200,{status:'committed',recordId:1,
            response:{data:{id:1,tenant_id:'tenant-a',status:'approved',version:2}}})
            : response(404,{status:'not_found'});
        }
        throw Error('Unexpected synthetic ZIP endpoint: ' + url);
      };
      const host = {origin,getApproval:async()=>true,
        getSession:async({fetchSession})=>fetchSession()};
      const browser = {location:globalThis.location,navigator:globalThis.navigator,
        localStorage:globalThis.localStorage};
      const adapter = mod.createP5R3c2ReferenceAdapter({host,browser,fetchImpl});
      const first = await adapter.begin({recordId:1,status:'approved',key});
      const journal = globalThis.localStorage.getItem(journalKey);
      const pending = JSON.parse(journal || 'null');
      const blocked = await adapter.begin({recordId:1,status:'approved',key});
      actor = {...actor,tenantId:'tenant-b'};
      const wrongTenant = await adapter.check();
      const retainedOnScopeChange = globalThis.localStorage.getItem(journalKey) === journal;
      actor = {...actor,tenantId:'tenant-a'};
      // Re-instantiating the host simulates a new client session reading durable
      // browser journal bytes; the separate R3b2b test covers true reload.
      const restored = mod.createP5R3c2ReferenceAdapter({host,browser,fetchImpl});
      const recovered = await restored.check();
      return {first,blocked,wrongTenant,recovered,writes,receiptReads,
        originalKey:pending?.key,validEtag:pending?.etag===etag,
        noCredential:!journal?.includes(csrf),retainedOnScopeChange,
        cleared:globalThis.localStorage.getItem(journalKey)===null};
    })()`);
    assert.deepEqual(portableRecovery, {
      first:{state:'pending',reason:'response-uncertain'},
      blocked:{state:'blocked',reason:'pending-exists'},
      wrongTenant:{state:'blocked',reason:'scope-or-ledger-changed'},
      recovered:{state:'committed'},writes:1,receiptReads:1,
      originalKey:'p5_zip_browser_recovery_00002',validEtag:true,
      noCredential:true,retainedOnScopeChange:true,cleared:true
    }, 'Actual ZIP runtime did not preserve original-key pending and receipt recovery');
    assert.deepEqual({posts:posts.length,mappedPosts:mappedPosts.length,
      patchCalls:patchCalls.length,deleteCalls:deleteCalls.length},p5Before,
      'Explicit synthetic ZIP recovery changed ordinary business mutations');
    console.log('P5-R3c2b2: exported Chromium runtime proved 503 pending, scope isolation and original-key receipt recovery');
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
    // C4: record-list/provider save is a separate historical implementation.
    // It must show bounded 422 field errors, preserve draft on committed-then-
    // 503, and report 403 as permission denial without any implicit retry.
    await evaluate("window.__atlasConfirm = window.confirm; window.confirm = () => true;");
    assert(await evaluate("(() => {const node=document.querySelector('input[aria-label=记录姓名C4]');if(!node)return false;node.focus();node.select();return true;})()"), 'C4 legacy record edit input unavailable');
    await call('Input.insertText', { text:'C4记录草稿' });
    assert(await click('保存修改C4'), 'C4 legacy save button unavailable');
    await until(() => legacySaveCalls.length === 1, 'C4 legacy 422 request missing');
    assert.deepEqual(legacySaveCalls[0], {name:'C4记录草稿'}, 'C4 legacy payload incorrect');
    await until(() => evaluate("document.querySelector('.atlas-record-error')?.textContent?.includes('记录字段服务端校验错误') || [...document.querySelectorAll('.atlas-record-error')].some(el=>el.textContent?.includes('记录字段服务端校验错误'))"), 'C4 record-specific 422 field error absent');
    assert(await click('保存修改C4'), 'C4 legacy retry confirmation missing');
    await until(() => legacySaveCalls.length === 2, 'C4 uncertain 503 request missing');
    await until(() => evaluate("document.querySelector('.atlas-record-list')?.textContent?.includes('写入结果不确定')"), 'C4 committed-then-503 classified incorrectly');
    await until(() => evaluate("document.querySelector('input[aria-label=记录姓名C4]')?.value === 'C4记录草稿'"), 'C4 uncertain save discarded draft');
    assert.equal(legacySaveCalls.length, 2, 'C4 uncertain record write was automatically retried');
    assert(await click('保存修改C4'), 'C4 legacy 403 submit missing');
    await until(() => legacySaveCalls.length === 3, 'C4 permission request missing');
    await until(() => evaluate("document.querySelector('.atlas-record-list')?.textContent?.includes('HTTP 403')"), 'C4 403 permission feedback missing');
    // C5: both clicks happen synchronously before React can re-render. The
    // provider's shared synchronous write lock must prevent duplicate POSTs.
    await evaluate("window.__c5Refreshes=0;window.addEventListener('atlas:records-refresh',()=>window.__c5Refreshes++);");
    const readsBeforeC5 = listReads;
    assert(await evaluate("(() => { const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='保存修改C4'); if(!b)return false; b.click(); b.click(); return true; })()"), 'C5 rapid double-click target unavailable');
    await until(() => legacySaveCalls.length === 4, 'C5 expected one new legacy write');
    await pause(500);
    assert.equal(legacySaveCalls.length, 4, 'C5 rapid double click produced duplicate POSTs');
    await until(() => evaluate("window.__c5Refreshes >= 1"), 'C5 mutation success did not broadcast shared refresh event');
    await until(() => listReads > readsBeforeC5, 'C5 shared refresh event did not trigger server GET');
    await evaluate("window.confirm = window.__atlasConfirm;");



    // Phase 22-C2: the shared source's createUrl wins over the legacy
    // form submitUrl and names are translated to backend saveField aliases.
    assert(await click('共享写入新增'), 'Shared create modal missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('共享写入表单')"), 'Shared create modal did not open');
    await fill('.ant-modal', '姓名', '映射新建');
    assert(await evaluate("(() => { const button=document.querySelector('.ant-modal-footer button.ant-btn-primary'); if(!button)return false;button.click();return true;})()"), 'Shared create submit missing');
    await until(() => mappedPosts.length === 1, 'Shared source POST target not called');
    assert.deepEqual(mappedPosts[0], {subject:'映射新建'}, 'Shared source outgoing alias not applied');
    await until(() => evaluate("!document.querySelector('.ant-modal')"), 'Shared create success did not close');
    mappedCommitThen503 = true;
    assert(await click('共享写入新增'), 'Shared uncertain write modal missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('共享写入表单')"), 'Shared uncertain modal open');
    await fill('.ant-modal', '姓名', '提交后503');
    assert(await evaluate("(() => { const button=document.querySelector('.ant-modal-footer button.ant-btn-primary'); if(!button)return false;button.click();return true;})()"), 'Shared uncertain submit missing');
    await until(() => mappedPosts.length === 2, 'Commit-then-503 mock request missing');
    assert.deepEqual(mappedPosts[1], {subject:'提交后503'}, 'Uncertain mutation mapped body missing');
    await until(() => evaluate("document.querySelector('.ant-modal [role=alert]')?.textContent?.includes('写入结果不确定')"), 'Committed-then-503 was not reported as uncertain');
    assert.equal(await evaluate("document.body.textContent.includes('不应执行的失败工作流')"), false, 'Uncertain write triggered failure workflow');
    assert(await evaluate("Boolean(document.querySelector('.ant-modal input[aria-label=姓名]'))"), 'Uncertain save lost the draft');
    await evaluate("document.querySelector('.ant-modal-footer button.ant-btn-default')?.click()");
    await until(() => evaluate("!document.querySelector('.ant-modal')"), 'Shared uncertain modal did not close');
    // C3: 422 validation errors use the shared source's backend alias
    // "subject" but must render beside the visible "姓名" input.
    assert(await click('共享写入新增'), 'C3 validation modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('共享写入表单')"), 'C3 validation modal missing');
    await fill('.ant-modal', '姓名', '字段不合格');
    assert(await evaluate("(() => {const b=document.querySelector('.ant-modal-footer button.ant-btn-primary');if(!b)return false;b.click();return true;})()"), 'C3 validation submit missing');
    await until(() => mappedPosts.length === 3, 'C3 422 backend did not receive mapped request');
    assert.deepEqual(mappedPosts[2], {subject:'字段不合格'}, 'C3 422 outgoing alias mismatch');
    await until(() => evaluate("document.querySelector('.ant-modal [role=alert]')?.textContent?.includes('服务器要求更正姓名')"), 'C3 backend alias error not displayed on form');
    assert(await evaluate("document.querySelector('.ant-modal')?.textContent?.includes('HTTP 422')"), 'C3 stable 422 status not displayed');
    await evaluate("document.querySelector('.ant-modal-footer button.ant-btn-default')?.click()");
    await until(() => evaluate("!document.querySelector('.ant-modal')"), 'C3 validation modal did not close');

    // 403 must remain a permission failure, never "possibly committed".
    assert(await click('共享写入新增'), 'C3 permission modal trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal')?.textContent?.includes('共享写入表单')"), 'C3 permission modal missing');
    await fill('.ant-modal', '姓名', '权限拒绝');
    assert(await evaluate("(() => {const b=document.querySelector('.ant-modal-footer button.ant-btn-primary');if(!b)return false;b.click();return true;})()"), 'C3 403 submit missing');
    await until(() => mappedPosts.length === 4, 'C3 403 server request missing');
    await until(() => evaluate("document.querySelector('.ant-modal [role=alert]')?.textContent?.includes('HTTP 403')"), 'C3 explicit permission feedback missing');
    assert.equal(await evaluate("document.querySelector('.ant-modal [role=alert]')?.textContent?.includes('写入结果不确定')"), false, 'C3 403 mislabeled uncertain');
    await evaluate("document.querySelector('.ant-modal-footer button.ant-btn-default')?.click()");
    await until(() => evaluate("!document.querySelector('.ant-modal')"), 'C3 permission modal did not close');


    assert(await click('打开错误示例'), 'Business drawer trigger missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body')?.textContent?.includes('失败反馈表单') || document.querySelector('.ant-drawer-body')?.textContent?.includes('模拟服务端失败')"), 'Business drawer open');
    await fill('.ant-drawer-body', '姓名', '测试失败');
    assert(await evaluate("(() => { const button = document.querySelector('.ant-drawer-footer button.ant-btn-primary'); if (!button) return false; button.click(); return true; })()"), 'Business drawer submit missing');
    await until(() => evaluate("document.querySelector('.ant-drawer-body [role=alert]')?.textContent?.includes('HTTP 400')"), 'Business drawer HTTP error');
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


    // Phase 22: The standalone table must query the backend, never fake paging
    // or sort only the two visible rows. Selecting its row reaches the edit modal.
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 4 条记录')"), 'Remote table GET loaded');
    assert(tableCalls.some((request) => request.page === '1' && request.pageSize === '2'), 'Initial server table page request missing');
    assert(await evaluate("(() => { const row = [...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el => el.textContent?.includes('更新姓名')); const button = row?.querySelector('button'); if (!button) return false; button.click(); return true; })()"), 'Table selected row action missing');
    assert(await click('编辑当前记录'), 'Edit trigger missing after table row selection');
    await until(() => evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value === '更新姓名'"), 'Selected table row not connected to edit modal');
    await evaluate("document.querySelector('.ant-modal-footer button.ant-btn-default')?.click()");

    assert(await evaluate("(() => { const button = document.querySelector('.pa-studio-remote-table .ant-pagination-next button'); if (!button) return false; button.click(); return true; })()"), 'Remote table next-page action missing');
    await until(() => tableCalls.some((request) => request.page === '2'), 'Remote table did not request page 2');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('可查对象')"), 'Remote table page 2 rows');
    assert(await evaluate("(() => { const button = document.querySelector('.pa-studio-remote-table .ant-pagination-prev button'); if (!button) return false; button.click(); return true; })()"), 'Remote table previous-page action missing');
    await until(() => tableCalls.filter((request) => request.page === '1').length > 1, 'Remote table did not request page 1 after back');

    assert(await evaluate("(() => { const header = document.querySelector('.pa-studio-remote-table th.ant-table-column-has-sorters'); if (!header) return false; header.click(); return true; })()"), 'Sortable table column missing');
    await until(() => tableCalls.some((request) => request.sort === 'name' && request.order === 'asc'), 'Remote table did not submit sorting to backend');

    assert(await evaluate("(() => { const field = document.querySelector('.pa-studio-remote-table select[aria-label=表格筛选]'); if (!field) return false; field.value = '已完成'; field.dispatchEvent(new Event('change',{bubbles:true})); return true; })()"), 'Table filter missing');
    await until(() => tableCalls.some((request) => request.filterField === 'status' && request.filter === '已完成'), 'Remote table filter parameters missing');
    assert(await evaluate("(() => { const field = document.querySelector('.pa-studio-remote-table input[aria-label=表格搜索]'); if (!field) return false; field.focus(); return true; })()"), 'Table search input missing');
    await call('Input.insertText', { text:'可查' });
    assert(await evaluate("(() => { const button = document.querySelector('.pa-studio-remote-table form button[type=submit]'); if (!button) return false; button.click(); return true; })()"), 'Table search submission missing');
    await until(() => tableCalls.some((request) => request.search === '可查' && request.filter === '已完成'), 'Server search plus filter not requested');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 1 条记录')"), 'Server filtered result count');


    // Phase 22-A hardening: a second page has NO record-list source. A row
    // selected on table page 2 must still feed detail GET and the edit modal.
    await evaluate("location.hash = '#/isolated'");
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('无列表远程表格')"), 'Isolated table-only route');
    await until(() => tableCalls.some((entry) => entry.view === 'shared'), 'Shared project-level table source did not issue GET');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('更新姓名')"), 'Shared field mapping did not map alias.name to name');
    assert.equal(await evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('不应显示的原始字段')"), false, 'Shared mapping failed to override raw name');
    const priorSharedReads = tableCalls.length;
    assert(await evaluate("(() => { const field=document.querySelector('.pa-studio-remote-table select[aria-label=表格筛选]'); if(!field)return false;field.value='待开始';field.dispatchEvent(new Event('change',{bubbles:true}));return true;})()"), 'Shared table filter control missing');
    await until(() => tableCalls.slice(priorSharedReads).some((request) => request.view === 'shared' && request.state === '待开始' && !request.filterField && !request.filter), 'Shared table did not honor custom state query parameter');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 1 条记录')"), 'Custom shared filter was not applied by server');
    assert(await evaluate("(() => { const field=document.querySelector('.pa-studio-remote-table select[aria-label=表格筛选]'); if(!field)return false;field.value='';field.dispatchEvent(new Event('change',{bubbles:true}));return true;})()"), 'Shared table filter reset missing');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 4 条记录')"), 'Shared table filter reset not server-authoritative');
    assert(await evaluate("!document.querySelector('.atlas-record-list')"), 'Isolated page unexpectedly contains record list');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 4 条记录')"), 'Isolated table data');
    assert(await evaluate("(() => { const button=document.querySelector('.pa-studio-remote-table .ant-pagination-next button'); if (!button) return false; button.click(); return true; })()"), 'Isolated table page 2 action');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('可查对象')"), 'Isolated page 2 fetched');
    assert(await evaluate("(() => { const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes('可查对象')); const button=row?.querySelector('button'); if (!button) return false; button.click(); return true; })()"), 'Choose page 2 record independent of list');
    await until(() => detailCalls.includes('/api/row/T-3'), 'Details GET for page 2 record');
    await until(() => evaluate("document.querySelector('.ant-modal') === null && [...document.querySelectorAll('button')].some(b=>b.textContent?.includes('编辑跨页记录') && !b.disabled)"), 'Editable detail loaded');
    assert(await click('编辑跨页记录'), 'Independent edit modal trigger');
    await until(() => evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value === '详情可查对象'"), 'Detail GET did not prefill table-selected record');
    assert.equal(await evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value === '不应显示的详情字段'"), false, 'Shared detail field mappings were not applied');
    assert.equal(await evaluate("document.querySelector('.ant-modal input[aria-label=邮箱]')?.value"), 'detail@example.org', 'Hidden form field not hydrated from detail');
    await evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.focus()");
    await evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.select()");
    await call('Input.insertText',{text:'独立表格修改'});
    assert(await evaluate("(() => {const button=document.querySelector('.ant-modal-footer button.ant-btn-primary');if(!button)return false;button.click();return true;})()"), 'Independent edit save');
    await until(() => patchCalls.some(item=>item.path==='/api/edit/T-3'), 'PATCH selected page2 table record');
    const savedIsolated = patchCalls.find(item=>item.path==='/api/edit/T-3');
    assert.equal(savedIsolated.data.name,'独立表格修改', 'Incorrect independent edit payload');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('独立表格修改')"), 'Remote table refresh after independent edit');
    assert(await evaluate("(() => { const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes('另一对象')); const button=row?.querySelector('button'); if (!button) return false; button.click(); return true; })()"), 'Select bad detail record');
    await until(() => detailCalls.includes('/api/row/T-4'), 'Bad detail GET was not attempted');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table [role=alert]')?.textContent?.includes('主键不匹配')"), 'Mismatched detail ID was not rejected');
    assert(await evaluate("([...document.querySelectorAll('button')].find(b=>b.textContent?.includes('编辑跨页记录'))?.disabled === true)"), 'Invalid detail record must block edit');

    // Rapid row switching: an older, slower mismatched detail request must not
    // overwrite the later successful selection or disable its edit control.
    const chooseIsolatedRow = (name) => evaluate("(() => { const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes(" + JSON.stringify(name) + ")); const button=row?.querySelector('button'); if(!button)return false;button.click();return true;})()");
    const editIsolatedEnabled = () => evaluate("([...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='编辑跨页记录')?.disabled === false)");
    const detailCount = (id) => detailCalls.filter((path) => path === '/api/row/' + id).length;
    slowNextDetailId = 'T-4';
    const slowStart = detailCount('T-4');
    assert(await chooseIsolatedRow('另一对象'), 'Slow detail row cannot be selected');
    await until(() => detailCount('T-4') > slowStart, 'Slow detail request did not start');
    assert.equal(await editIsolatedEnabled(), false, 'Edit enabled while detail is pending');
    const freshStart = detailCount('T-3');
    assert(await chooseIsolatedRow('独立表格修改'), 'New detail row cannot supersede pending selection');
    await until(() => detailCount('T-3') > freshStart, 'Replacement detail request did not start');
    await until(editIsolatedEnabled, 'Replacement detail did not enable editing');
    await pause(1350);
    assert.equal(await editIsolatedEnabled(), true, 'Cancelled stale response poisoned newer selection');
    assert.equal(await evaluate("Boolean(document.querySelector('.pa-studio-remote-table [role=alert]'))"), false, 'Stale detail failure surfaced after replacement');
    assert(await click('编辑跨页记录'), 'Replacement record edit trigger missing');
    await until(() => evaluate("document.querySelector('.ant-modal input[aria-label=姓名]')?.value === '详情独立表格修改'"), 'Rapid selection opened stale record');
    await evaluate("document.querySelector('.ant-modal-footer button.ant-btn-default')?.click()");

    // An explicit HTTP detail failure must block PATCH; a subsequent retry
    // must recover without route reload or a record-list provider.
    failNextDetailId = 'T-3';
    const errorStart = detailCount('T-3');
    assert(await chooseIsolatedRow('独立表格修改'), 'HTTP failure scenario row missing');
    await until(() => detailCount('T-3') > errorStart, 'Failed detail GET did not start');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table [role=alert]')?.textContent?.includes('HTTP 503')"), 'HTTP failure not surfaced');
    assert.equal(await editIsolatedEnabled(), false, 'HTTP failed detail enabled edit');
    const retryStart = detailCount('T-3');
    assert(await chooseIsolatedRow('独立表格修改'), 'Detail retry row missing');
    await until(() => detailCount('T-3') > retryStart, 'Detail retry request missing');
    await until(editIsolatedEnabled, 'Successful detail retry did not restore edit');
    assert.equal(await evaluate("Boolean(document.querySelector('.pa-studio-remote-table [role=alert]'))"), false, 'Successful retry did not clear prior detail error');

    // Phase 22-B2: read-only row details use a real GET but do not overwrite
    // the selected-record edit context. Hidden detail fields remain visible.
    const viewIsolatedRow = (name) => evaluate("(() => { const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes(" + JSON.stringify(name) + "));const button=[...(row?.querySelectorAll('button')??[])].find(el=>el.textContent?.replace(/\\s/g,'')==='查看');if(!button)return false;button.click();return true;})()");
    const drawerBody = () => evaluate("document.querySelector('.ant-drawer-body')?.textContent ?? ''");
    const closeDetail = () => evaluate("(() => { const button=document.querySelector('.ant-drawer-close');if(!button)return false;button.click();return true;})()");
    const initialDetailReads = detailCount('T-3');
    assert(await viewIsolatedRow('独立表格修改'), 'Read-only view row action missing');
    await until(() => detailCount('T-3') > initialDetailReads, 'Read-only view did not issue GET');
    await until(async () => (await drawerBody()).includes('detail@example.org'), 'Read-only view did not show detail-only email');
    assert((await drawerBody()).includes('详情独立表格修改'), 'Read-only view did not display server name');
    assert(await closeDetail(), 'Read-only detail drawer close missing');
    await until(() => evaluate("!document.querySelector('.ant-drawer-body')"), 'Read-only detail drawer did not close');

    // HTTP rejection stays in the detail view and does not submit or enable
    // a stale selected-record edit. The next open must recover without reload.
    failNextDetailId = 'T-3';
    const failViewStart = detailCount('T-3');
    assert(await viewIsolatedRow('独立表格修改'), 'Error view trigger missing');
    await until(() => detailCount('T-3') > failViewStart, 'Error view GET missing');
    await until(async () => (await drawerBody()).includes('HTTP 503'), 'Read-only detail did not display 503');
    assert(await closeDetail(), 'Error drawer cannot close');
    await until(() => evaluate("!document.querySelector('.ant-drawer-body')"), 'Error drawer did not unmount');
    assert(await viewIsolatedRow('独立表格修改'), 'View retry action missing');
    await until(async () => (await drawerBody()).includes('detail@example.org'), 'Read-only view retry did not recover');
    assert(await closeDetail(), 'Recovered drawer cannot close');
    await until(() => evaluate("!document.querySelector('.ant-drawer-body')"), 'Recovered drawer did not unmount');

    // Quick switching aborts an outdated detail GET. T-4 deliberately returns
    // a mismatched record ID, which must never poison a newer T-3 view.
    slowNextDetailId = 'T-4';
    const oldViewStart = detailCount('T-4');
    assert(await viewIsolatedRow('另一对象'), 'Slow read-only detail trigger missing');
    await until(() => detailCount('T-4') > oldViewStart, 'Slow read-only GET missing');
    assert(await viewIsolatedRow('独立表格修改'), 'Cannot supersede slow read-only GET');
    await until(async () => (await drawerBody()).includes('detail@example.org'), 'Replacement read-only view missing');
    await pause(1300);
    assert((await drawerBody()).includes('详情独立表格修改'), 'Stale mismatched response replaced new detail');
    assert(!(await drawerBody()).includes('主键不匹配'), 'Stale detail error leaked to current view');
    assert(await closeDetail(), 'Replacement drawer close missing');
    await until(() => evaluate("!document.querySelector('.ant-drawer-body')"), 'Replacement drawer still mounted');

    // Phase 22-B row actions: explicit confirmation, server authorization, no
    // optimistic disappearance on 403, retry, and GET-driven reconciliation.
    const deleteRow = (name) => evaluate("(() => { const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes(" + JSON.stringify(name) + "));const button=[...(row?.querySelectorAll('button')??[])].find(el=>el.textContent?.replace(/\\s/g,'')==='删除');if(!button)return false;button.click();return true;})()");
    const confirmDelete = () => evaluate("(() => { const button=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(el=>el.textContent?.replace(/\\s/g,'')==='确认删除');if(!button)return false;button.click();return true;})()");
    const cancelDelete = () => evaluate("(() => { const button=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(el=>el.textContent?.replace(/\\s/g,'')==='取消');if(!button)return false;button.click();return true;})()");
    assert(await deleteRow('独立表格修改'), 'Row delete action not rendered');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Row delete confirmation missing');
    assert.equal(deleteCalls.length, 0, 'DELETE sent before explicit confirmation');
    assert(await cancelDelete(), 'Delete cancel action unavailable');
    await pause(250);
    assert.equal(deleteCalls.length, 0, 'Cancelled deletion reached backend');
    assert(await deleteRow('独立表格修改'), 'Delete retry action missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Delete confirmation did not reopen');
    assert(await confirmDelete(), 'Delete confirmation button unavailable');
    await until(() => deleteCalls.length === 1, 'DELETE 403 request missing');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table [role=alert]')?.textContent?.includes('HTTP 403')"), '403 authorization denial not surfaced');
    assert(await evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('独立表格修改')"), 'Failed delete removed row optimistically');
    assert.equal(await editIsolatedEnabled(), true, '403 deletion incorrectly cleared selected edit context');
    const readsBeforeDelete = tableCalls.length;
    assert(await deleteRow('独立表格修改'), 'Delete after 403 not retryable');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Retry delete confirmation missing');
    assert(await confirmDelete(), 'Delete retry confirmation unavailable');
    await until(() => deleteCalls.length === 2, 'Successful DELETE request missing');
    assert.deepEqual(deleteCalls, ['/api/delete/T-3','/api/delete/T-3'], 'Delete target changed or was not ID-safe');
    await until(() => tableCalls.length > readsBeforeDelete, 'Successful DELETE did not refresh server table GET');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 3 条记录')"), 'Server total not reconciled after DELETE');
    assert.equal(await editIsolatedEnabled(), false, 'Deleted selected record remains editable');
    assert.equal(await evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('独立表格修改')"), false, 'Deleted row remained visible');
    assert.equal(await evaluate("Boolean(document.querySelector('.pa-studio-remote-table [role=alert]'))"), false, 'Successful delete did not clear failed attempt state');

    // Deleting the final row of server page 2 shrinks 3 rows to 2. The page
    // cursor must recover to 1, and the final view must come from a real GET.
    const readsBeforeBoundaryDelete = tableCalls.length;
    assert(await deleteRow('另一对象'), 'Last-page delete control missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Last-page confirmation missing');
    assert(await confirmDelete(), 'Last-page delete confirmation unavailable');
    await until(() => deleteCalls.includes('/api/delete/T-4'), 'Last-page DELETE was not sent');
    await until(() => tableCalls.slice(readsBeforeBoundaryDelete).some((item) => item.page === '2'), 'Deleted last-page row did not trigger page-2 refetch');
    await until(() => tableCalls.slice(readsBeforeBoundaryDelete).some((item) => item.page === '1'), 'Invalid server page did not fall back to page 1');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 2 条记录')"), 'Recovered last page total not rendered');
    assert(await evaluate("document.querySelector('.pa-studio-remote-table .ant-pagination-item-active')?.textContent?.trim() === '1'"), 'Table remained on invalid page after DELETE');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('更新姓名')"), 'Recovered page 1 was not rendered');

    // Primary keys containing /, spaces and '?' must be encoded before DELETE.
    assert(await deleteRow('更新姓名'), 'Encoded-ID record delete missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Encoded-ID confirmation missing');
    assert(await confirmDelete(), 'Encoded-ID delete confirmation unavailable');
    await until(() => deleteCalls.includes('/api/delete/R%2F1%20%3F'), 'Special-character ID was not URI encoded for DELETE');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 1 条记录')"), 'Encoded-ID delete did not refresh server total');
    assert.equal(await evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('更新姓名')"), false, 'Encoded-ID delete still displays removed record');

    // B3: 4 records over 2 pages. Selection deliberately never spans
    // pages; cancelling the bulk confirmation must issue zero DELETEs.
    tableRows.push(
      {id:'B-1',name:'批量失败对象',status:'待开始',etag:'"v1"'},
      {id:'B-2',name:'批量后续对象',status:'进行中',etag:'"v1"'},
      {id:'B-3',name:'批量末页对象',status:'已完成',etag:'"v1"'}
    );
    assert(await evaluate("(() => {const button=[...document.querySelectorAll('.pa-studio-remote-table .pa-studio-widget-actions button')].find(b=>b.textContent?.replace(/\\s/g,'')==='刷新');if(!button)return false;button.click();return true;})()"), 'Bulk fixture refresh missing');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 4 条记录')"), 'Bulk fixture server total missing');
    const selectBulkRow = async (name) => {
      // A visible row can still be loading after a page switch. Clicking a
      // disabled checkbox returns without changing React selection state.
      // Wait for the real control to become actionable on slower Windows CI.
      const checkboxReady = "(() => {const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes(" + JSON.stringify(name) + "));const check=row?.querySelector('input[type=checkbox]');return Boolean(check && !check.disabled);})()";
      await until(() => evaluate(checkboxReady), 'Bulk row checkbox interactive: ' + name);
      return evaluate("(() => {const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(el=>el.textContent?.includes(" + JSON.stringify(name) + "));const check=row?.querySelector('input[type=checkbox]');if(!check||check.disabled)return false;check.click();return true;})()");
    };
    const selectedCount = (count) => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('当前页已选择 " + String(count) + " 条')");
    assert(await selectBulkRow('第二对象'), 'Bulk row checkbox missing');
    await until(() => selectedCount(1), 'Bulk first selected row count');
    // The selection count can reset before the page-2 fetch and React DOM
    // commit. Require both the fresh server GET and page-2 rendered rows.
    const readsBeforeBulkNext = tableCalls.length;
    assert(await evaluate("(() => {const button=document.querySelector('.pa-studio-remote-table .ant-pagination-next button');if(!button)return false;button.click();return true;})()"), 'Bulk next-page button missing');
    await until(() => tableCalls.slice(readsBeforeBulkNext).some((item) => item.page === '2'), 'Bulk page-2 authoritative GET missing');
    await until(() => evaluate("(() => {const table=document.querySelector('.pa-studio-remote-table');const active=table?.querySelector('.ant-pagination-item-active')?.textContent?.trim();const rows=table?.querySelector('tbody')?.textContent??'';return active==='2'&&rows.includes('批量后续对象')&&rows.includes('批量末页对象')&&!rows.includes('第二对象')&&!table?.querySelector('.ant-spin-spinning')&&table?.querySelectorAll('tbody tr').length===2;})()"), 'Bulk page-2 authoritative rows not rendered');
    await until(() => selectedCount(0), 'Cross-page multi-selection was not cleared');
    // Page 1 must similarly reflect a completed new GET, not residual rows
    // from before navigation or an optimistic pagination selection reset.
    const readsBeforeBulkPrev = tableCalls.length;
    assert(await evaluate("(() => {const button=document.querySelector('.pa-studio-remote-table .ant-pagination-prev button');if(!button)return false;button.click();return true;})()"), 'Bulk previous-page button missing');
    await until(() => tableCalls.slice(readsBeforeBulkPrev).some((item) => item.page === '1'), 'Bulk page-1 authoritative GET missing');
    await until(() => evaluate("(() => {const table=document.querySelector('.pa-studio-remote-table');const active=table?.querySelector('.ant-pagination-item-active')?.textContent?.trim();const rows=table?.querySelector('tbody')?.textContent??'';return active==='1'&&rows.includes('第二对象')&&rows.includes('批量失败对象')&&!rows.includes('批量末页对象')&&!table?.querySelector('.ant-spin-spinning')&&table?.querySelectorAll('tbody tr').length===2;})()"), 'Bulk page-1 authoritative rows not rendered');
    assert(await selectBulkRow('第二对象'), 'Bulk row one unavailable');
    await until(() => selectedCount(1), 'Bulk first row not reselected');
    assert(await selectBulkRow('批量失败对象'), 'Bulk row two unavailable');
    await until(() => selectedCount(2), 'Bulk two-row selection missing');
    const batchTrigger = () => evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(el=>el.textContent?.replace(/\\s/g,'')==='批量删除');if(!b)return false;b.click();return true;})()");
    const confirmBulk = () => evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(el=>el.textContent?.replace(/\\s/g,'')==='确认批量删除');if(!b)return false;b.click();return true;})()");
    const deleteCountBeforeBatch = deleteCalls.length;
    assert(await batchTrigger(), 'Bulk delete trigger missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Bulk confirm unavailable');
    assert.equal(deleteCalls.length, deleteCountBeforeBatch, 'Bulk delete sent without confirmation');
    assert(await cancelDelete(), 'Bulk confirmation cannot be cancelled');
    await pause(250);
    assert.equal(deleteCalls.length, deleteCountBeforeBatch, 'Cancelled bulk deletion sent requests');
    failNextBatchDeleteId = 'B-1';
    assert(await batchTrigger(), 'Bulk delete confirmation cannot reopen');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Bulk retry confirmation unavailable');
    assert(await confirmBulk(), 'Explicit bulk confirmation failed');
    await until(() => deleteCalls.length === deleteCountBeforeBatch + 2, 'Bulk did not send two bounded DELETE requests');
    assert.deepEqual(deleteCalls.slice(deleteCountBeforeBatch), ['/api/delete/T-2', '/api/delete/B-1'], 'Bulk request order or selected IDs inconsistent');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table .ant-alert')?.textContent?.includes('成功 1 条，失败 1 条')"), 'Bulk partial failure not reported');
    assert(await evaluate("document.querySelector('.pa-studio-remote-table .ant-alert')?.textContent?.includes('HTTP 403')"), 'Failed item HTTP status not reported');
    await until(() => selectedCount(1), 'Failed item not retained for retry');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 3 条记录')"), 'Partial successful bulk delete not reconciled from GET');
    const countBeforeRetry = deleteCalls.length;
    assert(await batchTrigger(), 'Failed-only bulk retry trigger missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'Failed-only confirmation missing');
    assert(await confirmBulk(), 'Failed-only retry confirmation failed');
    await until(() => deleteCalls.length === countBeforeRetry + 1, 'Failed-only retry did not send DELETE');
    assert.equal(deleteCalls.at(-1), '/api/delete/B-1', 'Retry deleted previously successful item');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table .ant-alert')?.textContent?.includes('成功 1 条，失败 0 条')"), 'Retry result not reported');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 2 条记录')"), 'Retry did not refresh server total');
    await until(() => selectedCount(0), 'Bulk selection remained stale after successful retry');
    assert.equal(tableRows.some((row) => row.id === 'T-2' || row.id === 'B-1'), false, 'Batch outcomes not applied by backend');
    assert(deleteHeaders.every((entry) => entry.etag === '"v1"'), 'Prior DELETE requests lacked configured If-Match strong ETag');

    // B4: strong ETag stale precondition, definitive 412, authoritative
    // refresh, then a new manual confirmation with the current version.
    tableRows.push({id:'C-1',name:'并发冲突对象',status:'待开始',etag:'"v1"'});
    const refreshRemoteTable = () => evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table .pa-studio-widget-actions button')].find(el=>el.textContent?.replace(/\\s/g,'')==='刷新');if(!b)return false;b.click();return true;})()");
    const nextRemotePage = () => evaluate("(() => {const b=document.querySelector('.pa-studio-remote-table .ant-pagination-next button');if(!b)return false;b.click();return true;})()");
    assert(await refreshRemoteTable(), 'B4 conflict fixture refresh unavailable');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 3 条记录')"), 'B4 conflict count unavailable');
    assert(await nextRemotePage(), 'B4 conflict next page unavailable');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('并发冲突对象')"), 'B4 conflict target not loaded');
    tableRows.find((row) => row.id === 'C-1').etag = '"v2"';
    const conflictCallsStart = deleteCalls.length;
    assert(await deleteRow('并发冲突对象'), 'B4 row delete button unavailable');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'B4 conflict confirmation unavailable');
    assert(await confirmDelete(), 'B4 conflict confirmation cannot submit');
    await until(() => deleteCalls.length === conflictCallsStart + 1, 'B4 conditional DELETE missing');
    assert.deepEqual(deleteHeaders.at(-1), {url:'/api/delete/C-1',etag:'"v1"'}, 'B4 conditional request did not use loaded ETag');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table [role=alert]')?.textContent?.includes('HTTP 412')"), 'B4 conflict was not displayed');
    assert(tableRows.some((row) => row.id === 'C-1'), 'B4 stale precondition removed server record');
    // A real GET must refresh the guarded row with the new ETag.
    await until(() => tableCalls.at(-1)?.page === '2', 'B4 conflict did not cause server refresh');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('并发冲突对象')"), 'B4 refreshed conflict target missing');
    await pause(250);
    assert(await deleteRow('并发冲突对象'), 'B4 conflict retry button missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'B4 new-version confirmation missing');
    assert(await confirmDelete(), 'B4 new-version delete confirmation unavailable');
    await until(() => deleteCalls.length === conflictCallsStart + 2, 'B4 explicit new-version DELETE missing');
    assert.deepEqual(deleteHeaders.at(-1), {url:'/api/delete/C-1',etag:'"v2"'}, 'B4 retry did not use refreshed ETag');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 2 条记录')"), 'B4 success did not reconcile GET');
    assert(!tableRows.some((row) => row.id === 'C-1'), 'B4 latest-version delete failed');

    // Indeterminate result: mock server commits C-2, then proxy reports 503.
    // The client must stop before writing C-3, report unknown + skipped, and
    // never silently resend C-2.
    tableRows.push({id:'C-2',name:'已执行但返回503',status:'待开始',etag:'"v1"'});
    tableRows.push({id:'C-3',name:'未执行的下一条',status:'进行中',etag:'"v1"'});
    assert(await refreshRemoteTable(), 'B4 uncertain fixture refresh unavailable');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 4 条记录')"), 'B4 uncertain fixture total missing');
    assert(await nextRemotePage(), 'B4 uncertain next page unavailable');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table tbody')?.textContent?.includes('已执行但返回503')"), 'B4 unknown-result row missing');
    assert(await selectBulkRow('已执行但返回503'), 'B4 unknown-result selection missing');
    assert(await selectBulkRow('未执行的下一条'), 'B4 next-row selection missing');
    await until(() => selectedCount(2), 'B4 selected two rows missing');
    commitThen503Id = 'C-2';
    const beforeUnknown = deleteCalls.length;
    assert(await batchTrigger(), 'B4 uncertain bulk action missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'B4 unknown confirmation unavailable');
    assert(await confirmBulk(), 'B4 unknown confirmation failed');
    await until(() => deleteCalls.length === beforeUnknown + 1, 'B4 uncertain DELETE was not issued');
    assert.deepEqual(deleteCalls.slice(beforeUnknown), ['/api/delete/C-2'], 'B4 sent later DELETE after uncertain write');
    await until(() => evaluate("[...document.querySelectorAll('.pa-studio-remote-table .ant-alert')].some(x=>x.textContent?.includes('结果不确定 1 条，未执行 1 条'))"), 'B4 unknown/skipped result not shown');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='true'"), 'B4 uncertain DELETE must lock all new deletions');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('共 3 条记录')"), 'B4 unknown response did not reconcile actual server GET');
    await until(() => selectedCount(0), 'B4 unknown write was offered as automatic retry');
    assert.equal(deleteCalls.length, beforeUnknown + 1, 'B4 unknown write was blindly retried');
    assert(!tableRows.some((row) => row.id === 'C-2'), 'B4 simulated server-side commit missing');
    assert(tableRows.some((row) => row.id === 'C-3'), 'B4 skipped write erroneously executed');

    // The fixture has independently verified the simulated server state above.
    // A deliberate user acknowledgment is required before the next DELETE.
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('已核对服务端，解除删除锁定'));if(!b)return false;b.click();return true;})()"), 'B4 explicit unlock control missing');
    await until(() => evaluate("[...document.querySelectorAll('.ant-popconfirm-buttons button')].some(x=>x.textContent?.replace(/\\s/g,'').includes('已核对，解除锁定'))"), 'B4 explicit review confirmation unavailable');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('已核对，解除锁定'));if(!b)return false;b.click();return true;})()"),'B4 explicit review confirmation failed');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='false'"), 'B4 delete lock not cleared by explicit review');
    assert.equal(deleteCalls.length, beforeUnknown+1, 'B4 review acknowledgement unexpectedly sent DELETE');

    // Missing strong ETag must fail closed before the next destructive request.
    // A prior row's text stays visible while server re-fetch is in flight.
    // Wait for a *new* GET and an interactive checkbox (loading=false) so
    // this check cannot delete against the stale in-memory ETag snapshot.
    const beforeEtagRefreshReads = tableCalls.length;
    tableRows.find((row) => row.id === 'C-3').etag = '';
    await until(() => evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table .pa-studio-widget-actions button')].find(x=>x.textContent?.replace(/\\s/g,'')==='刷新');return Boolean(b && !b.disabled);})()"), 'B4 ETag refresh action available');
    assert(await refreshRemoteTable(), 'B4 missing ETag refresh missing');
    await until(() => tableCalls.length > beforeEtagRefreshReads, 'B4 missing ETag server GET not received');
    await until(() => evaluate("(() => {const root=document.querySelector('.pa-studio-remote-table');const row=[...root?.querySelectorAll('tbody tr')??[]].find(x=>x.textContent?.includes('未执行的下一条'));const check=row?.querySelector('input[type=checkbox]');return Boolean(row && check && !check.disabled && !root.querySelector('.ant-spin-spinning'));})()"), 'B4 updated ETag page not interactive');
    const beforeMissingEtag = deleteCalls.length;
    assert(await deleteRow('未执行的下一条'), 'B4 missing-version DELETE trigger missing');
    await until(() => evaluate("Boolean(document.querySelector('.ant-popconfirm-buttons'))"), 'B4 missing-version confirmation missing');
    assert(await confirmDelete(), 'B4 missing-version confirmation missing action');
    await until(() => evaluate("[...document.querySelectorAll('.pa-studio-remote-table [role=alert]')].some(x=>x.textContent?.includes('强 ETag 前置条件无效'))"), 'B4 missing strong ETag not blocked');
    assert.equal(deleteCalls.length, beforeMissingEtag, 'B4 missing ETag issued an unguarded DELETE');

    // Prior workflow scenarios can navigate away from the exported overview.
    // Re-enter it and wait for an authoritative list GET before this scenario.
    console.log('C6: restoring exported overview for record reconciliation');
    await call('Page.navigate', { url: root + '/#/overview' });
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('张三')"), 'C6 restored overview records GET');
    console.log('C6: overview and second record confirmed');
    console.log('C6: before selecting second record');
    // C6: a server-page refresh must not jump from a non-first selected
    // record back to the first one. A disappeared target must fail closed.
    assert(await evaluate("(() => { const b=[...document.querySelectorAll('.atlas-record-rows button')].find(el=>el.textContent?.includes('张三'));if(!b)return false;b.click();return true;})()"), 'C6 second-row record unavailable');
    console.log('C6: second record click returned');
    await until(() => evaluate("document.querySelector('.atlas-record-rows button.active')?.textContent?.includes('张三')"), 'C6 second row did not become active');
    console.log('C6: active second record confirmed');
    assert(await evaluate("(() => {const el=document.querySelector('input[aria-label=记录姓名C4]');if(!el)return false;el.focus();el.select();return true;})()"), 'C6 non-first input unavailable');
    await call('Input.insertText', { text: 'C6第二行' });
    const c6ReadsBeforeSave = listReads;
    // The intentional full-page navigation above resets earlier test mocks.
    // Headless Chrome's native confirm dialog would block Runtime.evaluate.
    await evaluate("window.confirm = () => true");
    assert(await click('保存修改C4'), 'C6 save target missing');
    await until(() => legacySaveCalls.length === 5, 'C6 selected-record write missing');
    assert.equal(legacySaveCalls[4]?.name, 'C6第二行', 'C6 submitted a stale or wrong record draft');
    await until(() => listReads > c6ReadsBeforeSave, 'C6 save did not reconcile with server GET');
    await until(() => evaluate("document.querySelector('.atlas-record-rows button.active')?.textContent?.includes('C6第二行')"), 'C6 refresh silently selected another record');
    assert(await evaluate("document.querySelector('input[aria-label=记录姓名C4]')?.value === 'C6第二行'"), 'C6 refresh lost the selected record context');
    savedRecords.splice(1, 1);
    const c6ReadsBeforeExternalChange = listReads;
    await evaluate("window.dispatchEvent(new Event('atlas:records-refresh'))");
    await until(() => listReads > c6ReadsBeforeExternalChange, 'C6 external-change GET missing');
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('更新姓名') && !document.querySelector('.atlas-record-rows button.active')"), 'C6 disappeared record silently switched to the first item');
    assert.equal(legacySaveCalls.length, 5, 'C6 reconciliation issued an unexpected write');
    const c6ReadsBeforeRepeatedRefresh = listReads;
    await evaluate("window.dispatchEvent(new Event('atlas:records-refresh'))");
    await until(() => listReads > c6ReadsBeforeRepeatedRefresh, 'C6 repeated authoritative GET missing');
    await until(() => evaluate("document.querySelector('.atlas-record-rows')?.textContent?.includes('更新姓名') && !document.querySelector('.atlas-record-rows button.active')"), 'C6 repeated refresh reselected another record');
    assert.equal(legacySaveCalls.length, 5, 'C6 repeated refresh wrote another record');

    assert.equal(errors.length, 0, 'Browser runtime exceptions: ' + errors.join('; '));
    const snapshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (process.env.GITHUB_WORKSPACE && snapshot.data) {
      const artifacts = join(process.env.GITHUB_WORKSPACE, 'artifacts');
      mkdirSync(artifacts, { recursive: true });
      writeFileSync(join(artifacts, 'pattern-atlas-export-browser.png'), Buffer.from(snapshot.data, 'base64'));
    }
    console.log(JSON.stringify({ result: 'PASS', scenario: 'standalone-zip/Chromium', checks: ['React mount', 'signed two-series chart', 'live chart GET and refresh', 'modal cancel', 'drawer close', 'popconfirm confirm', 'overlay form POST/validation/error/refresh', 'record-list real GET refetch', 'legacy RecordProvider 422 field, committed 503 draft safety and 403 permission', 'shared mutation single-flight rapid double click and record GET broadcast', 'non-first record refresh retention and disappeared-target safety', 'selected record PATCH and linked source', 'shared createUrl and outgoing alias, committed-then-503 write uncertainty suppresses failure workflow', 'consistent POST error contract for 422 backend field alias and 403 permission denial', 'success/failure workflow branching', 'component emit', 'explicitly confirmed follow-up POST', 'remote table query/search/filter/sort/page + selected-record editing', 'cross-page table-only selection/detail/edit, mismatched-ID protection, request-race cancellation and HTTP retry', 'server-backed read-only row detail GET, 503 retry and stale request abort', 'confirmed DELETE with 403, retry, encoded ID, refetch and last-page recovery', 'page-scoped multi-select, confirmed batch DELETE, partial failure and failed-only retry', 'strong If-Match stale 412, re-fetch/manual new-version DELETE, committed-then-503 batch stop, missing ETag fail-closed', 'production Vite served P5 reference module loads only via explicit import and cannot authorize business writes', 'exported ZIP synthetic same-origin 503 pending, tenant isolation and original-key receipt recovery without business writes', 'no runtime errors'] }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    chrome?.kill();
    vite.kill();
    // Terminate lingering Chrome keep-alive sockets before waiting for close;
    // otherwise a failing assertion can conceal itself behind CI's 15m timeout.
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
    await pause(450);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
    catch (error) { console.warn('Could not fully delete disposable Chrome profile:', String(error)); }
  }
}
