#!/usr/bin/env node
/** P5-R3b2b: real Chromium with true same-origin Cookie + R3a + SQLite.
 * This is an isolated fixture PAGE, not a production Studio login or writer.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchChromiumCdp } from './chromium-cdp-start.mjs';

const root = resolve(import.meta.dirname, '../..');
const origin = 'http://127.0.0.1:5497';
const debug = 'http://127.0.0.1:9399';
const profile = mkdtempSync(join(tmpdir(), 'p5-r3b2b-chrome-'));
const windows = process.platform === 'win32';
const key = 'p5_r3b2b_browser_00001';
const journalName = 'p5-r3b2b-e2e-journal';
const body = '{"status":"approved"}';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const start = Date.now();
  while (Date.now() - start < 25000) {
    try { if (await fn()) return; } catch { /* not ready yet */ }
    await sleep(150);
  }
  throw new Error(label + ' timed out');
}
function killTree(process) {
  if (!process?.pid) return;
  if (windows) {
    try { execFileSync('taskkill', ['/PID', String(process.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch { process.kill(); }
  } else process.kill();
}
let fixture, chrome, socket, secondSocket;
try {
  fixture = spawn(windows ? 'python' : 'python3',
    ['-u', 'tooling/scripts/aas_p0/p5_r3b2_browser_fixture.py', '--port', '5497'],
    { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', items = [], resolvers = [], stderr = '';
  fixture.stdout.setEncoding('utf8');
  fixture.stderr.setEncoding('utf8');
  fixture.stderr.on('data', part => { stderr = (stderr + part).slice(-3000); });
  fixture.stdout.on('data', part => {
    buffer += part;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line) continue;
      const item = JSON.parse(line);
      if (resolvers.length) resolvers.shift()(item); else items.push(item);
    }
  });
  async function receive() {
    if (items.length) return items.shift();
    return Promise.race([
      new Promise(resolve => resolvers.push(resolve)),
      new Promise((_resolve, reject) => setTimeout(() =>
        reject(new Error('Fixture IPC timed out: ' + stderr)), 15000))
    ]);
  }
  async function command(type) {
    fixture.stdin.write(type + '\n');
    const response = await receive();
    assert.notEqual(response.type, 'error', 'Harness command denied');
    return response;
  }
  const ready = await receive();
  assert.equal(ready.type, 'ready');
  assert(ready.cookie?.length >= 32);
  await until(async () => (await fetch(origin + '/')).ok, 'Python same-origin fixture');

  chrome = await launchChromiumCdp({
    executable: process.env.CHROMIUM_BIN || 'google-chrome',
    port: 9399, profileRoot: profile
  });
  const newTab = await fetch(debug + '/json/new?about:blank', { method: 'PUT' });
  assert.equal(newTab.status, 200);
  socket = new WebSocket((await newTab.json()).webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const waiting = new Map(), exceptions = [];
  socket.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params?.exceptionDetails?.text || 'Browser exception');
    }
    const slot = waiting.get(msg.id);
    if (slot) {
      waiting.delete(msg.id);
      clearTimeout(slot.timer);
      if (msg.error) slot.reject(new Error(msg.error.message));
      else slot.resolve(msg.result);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => {
      waiting.delete(requestId);
      reject(new Error('CDP timeout: ' + method));
    }, 15000);
    waiting.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  async function evalCode(expression) {
    const reply = await call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (reply.exceptionDetails) {
      throw new Error('Browser evaluation: ' + (reply.exceptionDetails.exception?.description || reply.exceptionDetails.text));
    }
    return reply.result?.value;
  }
  const evaluate = (fn, args = {}) => evalCode('(' + fn.toString() + ')(' + JSON.stringify(args) + ')');
  async function setCookie(value) {
    const result = await call('Network.setCookie', {
      url: origin + '/', name: 'P5ReferenceSession', value,
      path: '/', httpOnly: true, secure: false, sameSite: 'Strict'
    });
    assert.equal(result.success, true);
  }
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: origin + '/' });
  await until(() => evalCode("!!globalThis.document.querySelector('#p5-browser-contract')"), 'Fixture page loaded');
  assert.equal(await evaluate(async function () {
    return (await fetch('/api/session', { credentials: 'same-origin' })).status;
  }), 401);
  await setCookie(ready.cookie);

  async function browserInitial(args) {
    const sessionResponse = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    if (sessionResponse.status !== 200) throw new Error('Same-origin session unavailable');
    const session = await sessionResponse.json();
    const mod = await import('/p5_capability_contract.mjs');
    const grant = await mod.discoverP5Capability({
      origin: globalThis.location.origin, verifiedIdentity: session.identity,
      fetchImpl: fetch, now: Date.now
    });
    const plan = mod.authorizeP5WritePlan({
      capability: grant, origin: globalThis.location.origin, verifiedIdentity: session.identity,
      method: 'PATCH', path: '/api/tasks/1', expectedProviderId: grant.providerId,
      expectedReceiptEpoch: grant.receiptEpoch
    });
    const model = await fetch(plan.path, { credentials: 'same-origin', cache: 'no-store' });
    if (model.status !== 200) throw new Error('Synthetic model unavailable');
    const etag = model.headers.get('etag');
    const journal = {
      version: 1, method: plan.method, path: plan.path, key: args.key,
      etag, body: args.body, providerId: plan.providerId,
      receiptEpoch: plan.receiptEpoch, tenantId: plan.tenantId,
      subjectId: plan.subjectId, sessionEpoch: plan.sessionEpoch
    };
    globalThis.localStorage.setItem(args.journalName, JSON.stringify(journal));
    const csrfFail = await fetch(plan.path, {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'X-P5-CSRF-Token': 'incorrect', 'Idempotency-Key': journal.key,
        'If-Match': etag, 'X-P5-Provider-Id': plan.providerId,
        'X-P5-Receipt-Epoch': plan.receiptEpoch }
    });
    if (csrfFail.status !== 403) throw new Error('CSRF guard failed');
    const response = await fetch(plan.path, {
      method: journal.method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json',
        'X-P5-CSRF-Token': session.csrfToken, 'Idempotency-Key': journal.key,
        'If-Match': journal.etag, 'X-P5-Provider-Id': plan.providerId,
        'X-P5-Receipt-Epoch': plan.receiptEpoch },
      body: journal.body
    });
    return { code: response.status, origin: globalThis.location.origin,
      cookieReadable: globalThis.document.cookie,
      saved: JSON.parse(globalThis.localStorage.getItem(args.journalName)) };
  }
  const initial = await evaluate(browserInitial, { key, body, journalName });
  assert.equal(initial.code, 503, 'Must observe commit-then-503');
  assert.equal(initial.origin, origin);
  assert.equal(initial.cookieReadable, '', 'HttpOnly cookie accessible to script');
  assert.equal(initial.saved.key, key);
  assert.equal(initial.saved.tenantId, 'tenant-a');
  assert.equal(JSON.stringify(initial.saved).includes(ready.cookie), false);
  const stats = (await command('STATS')).data;
  assert.deepEqual(stats, { status: 'approved', version: 2,
    receiptCount: 1, spentKeys: 1, committedAudits: 1, injected503Consumed: true });

  const rotated = await command('ROTATE');
  assert.equal(rotated.type, 'rotated');
  assert.notEqual(rotated.cookie, ready.cookie);
  await setCookie(ready.cookie);
  assert.equal(await evaluate(async function () {
    return (await fetch('/api/session', { credentials: 'same-origin' })).status;
  }), 401, 'Rotated-away session must be revoked');
  await setCookie(rotated.cookie);
  await call('Page.reload', { ignoreCache: true });
  await until(() => evalCode("globalThis.document.readyState === 'complete' && !!globalThis.document.querySelector('#p5-browser-contract')"),
    'Browser reload');

  async function browserRecover(args) {
    const journal = JSON.parse(globalThis.localStorage.getItem(args.journalName));
    if (!journal) throw new Error('Pending journal lost on reload');
    const session = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    if (session.status !== 200) throw new Error('Rotated cookie rejected');
    const identity = (await session.json()).identity;
    const mod = await import('/p5_capability_contract.mjs');
    const grant = await mod.discoverP5Capability({
      origin: globalThis.location.origin, verifiedIdentity: identity,
      fetchImpl: fetch, now: Date.now
    });
    if (grant.tenantId !== journal.tenantId || grant.subjectId !== journal.subjectId
      || grant.sessionEpoch !== journal.sessionEpoch
      || grant.providerId !== journal.providerId || grant.receiptEpoch !== journal.receiptEpoch) {
      throw new Error('Scope, provider or ledger epoch changed; recovery forbidden');
    }
    mod.authorizeP5WritePlan({ capability: grant, origin: globalThis.location.origin,
      verifiedIdentity: identity, method: journal.method, path: journal.path,
      expectedProviderId: journal.providerId, expectedReceiptEpoch: journal.receiptEpoch });
    const receipt = await fetch('/api/mutations/' + journal.key, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-P5-Provider-Id': journal.providerId,
        'X-P5-Receipt-Epoch': journal.receiptEpoch }
    });
    const body = await receipt.json();
    if (receipt.status !== 200 || body.status !== 'committed'
      || body.recordId !== 1 || body.response?.data?.version !== 2
      || body.response.data.status !== 'approved'
      || body.response.data.tenant_id !== journal.tenantId) {
      throw new Error('Durable original-key receipt not verified');
    }
    globalThis.window.__lastP5Proof = grant;
    globalThis.localStorage.removeItem(args.journalName);
    return { code: receipt.status, key: journal.key, identity,
      journalAbsent: globalThis.localStorage.getItem(args.journalName) === null,
      cookieReadable: globalThis.document.cookie };
  }
  const recovered = await evaluate(browserRecover, { journalName });
  assert.equal(recovered.code, 200);
  assert.equal(recovered.key, key);
  assert.equal(recovered.journalAbsent, true);
  assert.equal(recovered.cookieReadable, '');
  assert.equal(recovered.identity.tenantId, 'tenant-a');
  assert.deepEqual((await command('STATS')).data, stats, 'Original-key recovery caused duplicate write');

  // P5-R3c: actual TWO Chromium tabs under the same origin share Web Locks
  // and a scoped journal; unlike pure mocks this tests the browser scheduler.
  const secondTab = await fetch(debug + '/json/new?about:blank', {method:'PUT'});
  assert.equal(secondTab.status,200);
  secondSocket = new WebSocket((await secondTab.json()).webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    secondSocket.addEventListener('open',resolve,{once:true});
    secondSocket.addEventListener('error',reject,{once:true});
  });
  let secondId=0;
  const secondPending=new Map();
  secondSocket.addEventListener('message',event=>{
    const reply=JSON.parse(String(event.data));
    const handler=secondPending.get(reply.id);
    if(!handler)return;
    secondPending.delete(reply.id);
    clearTimeout(handler.timer);
    if(reply.error)handler.reject(new Error(reply.error.message));
    else handler.resolve(reply.result);
  });
  const secondCall=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++secondId;
    const timer=setTimeout(()=>{secondPending.delete(id);reject(new Error('Second Chromium tab timeout'))},15000);
    secondPending.set(id,{resolve,reject,timer});
    secondSocket.send(JSON.stringify({id,method,params}));
  });
  const secondEval=async(expression)=>{
    const r=await secondCall('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error('Second tab: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
    return r.result?.value;
  };
  const evalTab2=(fn,args={})=>secondEval('('+fn.toString()+')('+JSON.stringify(args)+')');
  await secondCall('Page.enable');
  await secondCall('Runtime.enable');
  await secondCall('Page.navigate',{url:origin+'/'});
  await until(()=>secondEval("!!globalThis.document.querySelector('#p5-browser-contract')"),
    'Second same-origin Chromium tab');

  // This closure is deliberately serialized and executed in either tab;
  // credentials and real identity are freshly read from the cookie session.
  async function browserScopedAction(args) {
    // This exact portable runtime is also emitted into exported React ZIPs.
    // The host functions are runtime-only (not serialized Studio sources).
    const module = await import('/p5_r3c2_runtime_adapter.mjs');
    const adapter = module.createP5R3c2ReferenceAdapter({
      host: {
        origin: globalThis.location.origin,
        getApproval: async ({fixtureOnly}) => fixtureOnly === true,
        getSession: async ({fetchSession}) => fetchSession()
      },
      browser: globalThis,
      fetchImpl: globalThis.fetch
    });
    if(args.action==='begin')return adapter.begin({
      recordId:1,status:args.status,key:args.key
    });
    if(args.action==='check')return adapter.check();
    if(args.action==='replay')return adapter.replay();
    throw new Error('Unknown test action');
  }
  // Hold an exclusive Web Lock in tab A. Tab B MUST fail fast rather than
  // queue a second write or fall back to a non-atomic localStorage lock.
  const locked=await evalCode("(() => { globalThis.__r3cHeld=false; void globalThis.navigator.locks.request('foundation:p5-r3c:synthetic-journal:exclusive:v1',{mode:'exclusive'},async()=>{globalThis.__r3cHeld=true;await new Promise(resolve=>{globalThis.__r3cRelease=resolve;});});return true;})()");
  assert.equal(locked,true);
  await until(()=>evalCode('globalThis.__r3cHeld===true'),'First tab Web Lock held');
  const blockedInSecond=await evalTab2(browserScopedAction,{
    action:'begin',key:'p5_r3c_browser_first_00001',status:'archived'
  });
  assert.deepEqual(blockedInSecond,{state:'busy'},'Second Chromium tab bypassed exclusive browser lock');
  assert.equal(await secondEval("globalThis.localStorage.getItem('foundation:p5-r3c:synthetic-pending:v1')"),null);
  await evalCode('globalThis.__r3cRelease();true');
  await until(async()=>evalCode("(async()=>!(await globalThis.navigator.locks.query()).held.some(x=>x.name==='foundation:p5-r3c:synthetic-journal:exclusive:v1'))()"),
    'First tab Web Lock released');

  const r3cBegin=await evalTab2(browserScopedAction,{
    action:'begin',key:'p5_r3c_browser_first_00001',status:'archived'
  });
  assert.deepEqual(r3cBegin,{state:'pending',reason:'await-original-receipt'});
  await secondCall('Page.reload',{ignoreCache:true});
  await until(()=>secondEval("globalThis.document.readyState==='complete' && !!globalThis.document.querySelector('#p5-browser-contract')"),
    'R3c second tab refresh preserves scoped journal');
  const journalInFirst=await evalCode("JSON.parse(globalThis.localStorage.getItem('foundation:p5-r3c:synthetic-pending:v1'))");
  assert.equal(journalInFirst.status,'archived');
  assert.equal(journalInFirst.tenantId,'tenant-a');
  assert.equal(JSON.stringify(journalInFirst).includes(rotated.cookie),false);
  const r3cBlocked=await evaluate(browserScopedAction,{
    action:'begin',key:'p5_r3c_browser_second_00002',status:'draft'
  });
  assert.deepEqual(r3cBlocked,{state:'blocked',reason:'pending-exists'});
  const r3cChecked=await evaluate(browserScopedAction,{
    action:'check',key:'p5_r3c_browser_ignored_00003',status:'draft'
  });
  assert.deepEqual(r3cChecked,{state:'committed'});
  assert.equal(await secondEval("globalThis.localStorage.getItem('foundation:p5-r3c:synthetic-pending:v1')"),null);
  const r3cOne=(await command('STATS')).data;
  assert.deepEqual(r3cOne,{status:'archived',version:3,
    receiptCount:2,spentKeys:2,committedAudits:2,injected503Consumed:true});

  // A second pending write is retained when the browser identity changes:
  // new tenant must not query, clear, or replay the previous actor's journal.
  const secondPendingWrite=await evalTab2(browserScopedAction,{
    action:'begin',key:'p5_r3c_browser_third_00004',status:'draft'
  });
  assert.deepEqual(secondPendingWrite,{state:'pending',reason:'await-original-receipt'});
  const r3cBeforeSwitch=(await command('STATS')).data;
  assert.deepEqual(r3cBeforeSwitch,{status:'draft',version:4,
    receiptCount:3,spentKeys:3,committedAudits:3,injected503Consumed:true});

  const other = await command('OTHER');
  assert.equal(other.type, 'other');
  await setCookie(other.cookie);
  async function browserDifferentUser(args) {
    const session = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
    const grant = globalThis.window.__lastP5Proof;
    const mod = await import('/p5_capability_contract.mjs');
    let refused = false;
    try {
      mod.authorizeP5WritePlan({ capability: grant, origin: globalThis.location.origin,
        verifiedIdentity: session.identity, method: 'PATCH', path: '/api/tasks/1',
        expectedProviderId: grant.providerId, expectedReceiptEpoch: grant.receiptEpoch });
    } catch { refused = true; }
    const response = await fetch('/api/mutations/' + args.key, {
      credentials: 'same-origin', headers: {
        'X-P5-Provider-Id': grant.providerId, 'X-P5-Receipt-Epoch': grant.receiptEpoch
      }
    });
    return { tenant: session.identity.tenantId, refused, code: response.status };
  }
  assert.deepEqual(await evaluate(browserDifferentUser, { key }),
    { tenant: 'tenant-b', refused: true, code: 404 });
  const wrongActorPending=await evaluate(browserScopedAction,{
    action:'check',key:'ignored-new-tenant-key_00005',status:'approved'
  });
  assert.deepEqual(wrongActorPending,{state:'blocked',reason:'scope-or-ledger-changed'});
  assert.equal(await evalCode("JSON.parse(globalThis.localStorage.getItem('foundation:p5-r3c:synthetic-pending:v1')).tenantId"),'tenant-a');
  assert.deepEqual((await command('STATS')).data,r3cBeforeSwitch);
  assert.equal((await command('REVOKE')).type, 'revoked');
  assert.equal(await evaluate(async function () {
    return (await fetch('/api/session', { credentials: 'same-origin' })).status;
  }), 401, 'Revoked session remained authorized');
  assert.deepEqual(exceptions, []);

  const output = resolve(root, 'artifacts/pattern-atlas/studio-p0-evidence');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'p5-r3b2b-chromium-session-recovery.json'),
    JSON.stringify({ status: 'PASS', origin, platform: process.platform,
      scope: 'Real Chromium + disposable true same-origin fixture (not Studio login)',
      checks: ['HttpOnly unreadable', 'R3a authenticated capability discovery and plan',
        'CSRF refusal', 'SQLite commit-then-503', 'Cookie rotation and reload',
        'Original-key receipt and exactly one synthetic SQLite transaction',
        'Cross-tenant denial', 'Revoked session denial', 'R3c real two-tab Web Locks busy/no-queue',
        'R3c shared pending journal and original-key receipt across tabs',
        'R3c changed-tenant pending recovery blocked'],
      sqlite: stats, limitations: [
        'No production SSO/OIDC or business database',
        'Journal belongs to this test harness, not a Studio/ZIP production feature',
        'P5-R3c Web Locks protect cooperating same-origin tabs, not multiple devices or production Stable'
      ] }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS', scenario: 'P5-R3b2b true same-origin Chromium session and durable receipt', platform: process.platform }));
} finally {
  if (secondSocket?.readyState === WebSocket.OPEN) secondSocket.close();
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (fixture?.stdin && !fixture.stdin.destroyed) fixture.stdin.end();
  killTree(fixture);
  killTree(chrome);
  await sleep(350);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* temp browser cleanup best-effort */ }
}
