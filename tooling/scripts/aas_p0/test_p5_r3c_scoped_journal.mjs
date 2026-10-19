import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverP5Capability, P5_CAPABILITY_VERSION
} from './p5_capability_contract.mjs';
import {
  P5_R3C_PENDING_KEY, P5_R3C_LOCK_NAME,
  runP5R3cOperation
} from './p5_r3c_scoped_journal.mjs';

const origin = 'https://app.example.test';
const actor = Object.freeze({
  tenantId:'tenant-a', subjectId:'alice',
  sessionEpoch:'11111111-1111-4111-8111-111111111111',role:'writer'
});
const providerId = '22222222-2222-4222-8222-222222222222';
const receiptEpoch = '33333333-3333-4333-8333-333333333333';
const ETag = '"' + 'a'.repeat(64) + '"';
const request = {
  method:'PATCH',path:'/api/tasks/1',key:'original-request-key-00001',
  etag:ETag,status:'approved',body:'{"status":"approved"}'
};
const key = request.key;
const session = {identity:actor,csrfToken:'p5_test_token_'+'a'.repeat(40)};
const receipt = {
  status:200,body:{status:'committed',recordId:1,response:{
    data:{id:1,tenant_id:'tenant-a',status:'approved',version:2}
  }}
};
function storage() {
  const values=new Map();
  return {
    values,
    getItem:k=>values.has(k)?values.get(k):null,
    setItem:(k,v)=>{values.set(k,String(v));},
    removeItem:k=>{values.delete(k);}
  };
}
function locks() {
  const held=new Set();
  return {
    calls:[],
    async request(name, opts, callback) {
      this.calls.push({name,opts});
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({name,mode:'exclusive'}); }
      finally {held.delete(name); }
    }
  };
}
function payload(overrides={}) {
  return {
    contract:P5_CAPABILITY_VERSION,providerId,receiptEpoch,
    scope:{tenantId:actor.tenantId,subjectId:actor.subjectId},
    guarantees:{
      atomicMutationAndReceipt:true,sameKeySameIntentReplay:true,
      authenticatedReceiptLookup:true,principalScopedKeys:true,
      conditionalMutation:true
    },
    minReceiptRetentionSeconds:604800,
    routes:[{method:'PATCH',path:'/api/tasks/{id}',receiptPath:'/api/mutations/{key}'}],
    ...overrides
  };
}
async function setup() {
  const st=storage(),lock=locks();
  const clock={value:2_000_000_000_000};
  const proof=await discoverP5Capability({
    origin,verifiedIdentity:actor,now:()=>clock.value,
    fetchImpl:async ()=>({
      status:200,url:origin+'/.well-known/foundation-idempotent-write/v1',
      redirected:false,
      headers:{get:n=>({
        'Content-Type':'application/json','Cache-Control':'private, no-store'
      })[n]??null},
      text:async()=>JSON.stringify(payload())
    })
  });
  const options={
    storage:st,lockManager:lock,capability:proof,origin,
    verifiedIdentity:actor,expectedProviderId:providerId,
    expectedReceiptEpoch:receiptEpoch,now:()=>clock.value,
    getTrustedSession:async()=>session,
    executePatch:async()=>({status:503}),
    queryReceipt:async()=>receipt
  };
  return {st,lock,clock,options};
}
const run=(options,action,extras={})=>
  runP5R3cOperation({...options,action,...extras});
async function begin(context,extra={}) {
  return run(context.options,'begin',{request,...extra});
}
const saved = st=>JSON.parse(st.getItem(P5_R3C_PENDING_KEY));

test('a first PATCH is journaled before network; transport loss retains original scoped bytes',async()=>{
  const c=await setup();
  let persisted=false;
  const result=await begin(c,{
    executePatch:async({plan,record,session:auth})=>{
      persisted=Boolean(c.st.getItem(P5_R3C_PENDING_KEY));
      assert.equal(plan.path,request.path);
      assert.equal(record.key,key);
      assert.equal(auth.csrfToken,session.csrfToken);
      throw new TypeError('transport disconnected');
    }
  });
  assert.deepEqual(result,{state:'pending',reason:'transport-unknown'});
  assert(persisted);
  assert.equal(saved(c.st).receiptEpoch,receiptEpoch);
  assert.equal(saved(c.st).tenantId,'tenant-a');
  assert.equal(saved(c.st).body,request.body);
  assert.equal(JSON.stringify(saved(c.st)).includes(session.csrfToken),false);
  assert.deepEqual(c.lock.calls[0],{
    name:P5_R3C_LOCK_NAME,opts:{mode:'exclusive',ifAvailable:true}
  });
});

test('HTTP 200 without an original-key receipt does not discard the journal',async()=>{
  const c=await setup();
  assert.deepEqual(await begin(c,{executePatch:async()=>({status:200})}),{
    state:'pending',reason:'await-original-receipt'
  });
  assert(saved(c.st));
  assert.deepEqual(await run(c.options,'check',{queryReceipt:async()=>({status:404})}),{
    state:'pending',reason:'receipt-not-found'
  });
  assert(saved(c.st));
});

test('authoritative scoped receipt clears only its exact journal once',async()=>{
  const c=await setup();await begin(c);
  assert.deepEqual(await run(c.options,'check'),{state:'committed'});
  assert.equal(c.st.getItem(P5_R3C_PENDING_KEY),null);
  assert.deepEqual(await run(c.options,'check'),{state:'idle'});
});

test('forged or inconsistent success receipt stays pending',async()=>{
  const c=await setup();await begin(c);
  for(const corruption of [
    {status:200,body:{...receipt.body,recordId:2}},
    {status:200,body:{...receipt.body,response:{data:{...receipt.body.response.data,tenant_id:'tenant-b'}}}},
    {status:200,body:{...receipt.body,response:{data:{...receipt.body.response.data,version:1}}}},
    {status:200,body:{...receipt.body,response:{data:{...receipt.body.response.data,status:'draft'}}}},
    {status:202,body:receipt.body}
  ]){
    assert.deepEqual(await run(c.options,'check',{queryReceipt:async()=>corruption}),{
      state:'pending',reason:'receipt-unverified'
    });
    assert(saved(c.st));
  }
});

test('404 is UNKNOWN: exact-key replay requires explicit user approval, then checks receipt first',async()=>{
  const c=await setup();await begin(c);
  let queries=0,writes=0;
  const queryReceipt=async()=>{queries++;return {status:404};};
  const executePatch=async({record})=>{
    writes++;
    assert.deepEqual(record,saved(c.st));
    return {status:503};
  };
  await assert.rejects(run(c.options,'replay',{confirmReplay:false,queryReceipt,executePatch}),/explicit replay/);
  assert.equal(writes,0);
  assert.deepEqual(await run(c.options,'replay',{confirmReplay:true,queryReceipt,executePatch}),{
    state:'pending',reason:'replay-uncertain'
  });
  assert.equal(queries,1);assert.equal(writes,1);
  assert(saved(c.st));
});

test('replay never sends PATCH when server already knows original receipt',async()=>{
  const c=await setup();await begin(c);
  let writes=0;
  assert.deepEqual(await run(c.options,'replay',{
    confirmReplay:true,executePatch:async()=>{writes++;return {status:200};}
  }),{state:'committed'});
  assert.equal(writes,0);
});

test('410 spent key, 409 epoch mismatch, 401/403 revocation stop and retain journal',async()=>{
  const c=await setup();await begin(c);
  for(const [status,reason] of [
    [410,'receipt-expired'],[409,'receipt-epoch-conflict'],
    [401,'authorization-revoked'],[403,'authorization-revoked']
  ]) {
    assert.deepEqual(await run(c.options,'check',{queryReceipt:async()=>({status})}),{
      state:'blocked',reason
    });
    assert(saved(c.st));
  }
});

test('cross-tenant or changed session identity cannot clear or replay a pending record',async()=>{
  const c=await setup();await begin(c);
  let called=0;
  const wrongActor={...actor,tenantId:'tenant-b'};
  assert.deepEqual(await run(c.options,'check',{
    verifiedIdentity:wrongActor,queryReceipt:async()=>{called++;}
  }),{state:'blocked',reason:'scope-or-ledger-changed'});
  assert.equal(called,0);
  const wrongSession={...actor,sessionEpoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  assert.deepEqual(await run(c.options,'check',{
    verifiedIdentity:wrongSession
  }),{state:'blocked',reason:'scope-or-ledger-changed'});
  assert.equal(called,0);
  assert(saved(c.st));
});

test('authenticated writer revoked or role downgraded after 503 blocks receipt IO',async()=>{
  const c=await setup();await begin(c);
  let called=false;
  await assert.rejects(run(c.options,'check',{
    getTrustedSession:async()=>({...session,identity:{...actor,role:'reader'}}),
    queryReceipt:async()=>{called=true;}
  }),/trusted writer session/);
  assert.equal(called,false);
  assert(saved(c.st));
});

test('unavailable Web Locks fail closed, no localStorage lock or network fallback',async()=>{
  const c=await setup();
  await assert.rejects(run(c.options,'begin',{lockManager:null,request}),/Web Locks unavailable/);
  assert.equal(c.st.values.size,0);
});

test('same-origin concurrent tab loses ifAvailable lock while first is awaiting the server',async()=>{
  const c=await setup();
  let release;
  const held=new Promise(resolve=>{release=resolve;});
  let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const first=begin(c,{executePatch:async()=>{
    entered();
    await held;
    return {status:503};
  }});
  await started;
  assert.deepEqual(await begin(c),{state:'busy'});
  assert(saved(c.st));
  release();
  assert.deepEqual(await first,{state:'pending',reason:'response-uncertain'});
  assert.deepEqual(await begin(c),{state:'blocked',reason:'pending-exists'});
});

test('storage failure, corrupt journal, missing ETag and invented provider all reject before PATCH',async()=>{
  const c=await setup();
  await assert.rejects(begin(c,{storage:{
    getItem:()=>null,setItem:()=>{throw new Error('storage denied');},
    removeItem:()=>{}
  }}),/storage denied/);
  assert.equal(c.st.values.size,0);
  c.st.setItem(P5_R3C_PENDING_KEY,'{"version":1,"token":"secret"}');
  await assert.rejects(begin(c),/damaged/);
  c.st.removeItem(P5_R3C_PENDING_KEY);
  await assert.rejects(begin(c,{request:{...request,etag:'W/'+ETag}}),/strong ETag/);
  await assert.rejects(begin(c,{expectedProviderId:'44444444-4444-4444-8444-444444444444'}),/provider/);
  assert.equal(c.st.getItem(P5_R3C_PENDING_KEY),null);
});

test('a stale authenticated discovery cannot authorize further mutation or recovery',async()=>{
  const c=await setup();c.clock.value+=15001;
  await assert.rejects(begin(c),/expired/);
  assert.equal(c.st.values.size,0);
});

test('a journal cannot be silently replaced while waiting for an authenticated receipt',async()=>{
  const c=await setup();await begin(c);
  let existing=saved(c.st);
  const result=await run(c.options,'check',{queryReceipt:async()=>{
    c.st.setItem(P5_R3C_PENDING_KEY,JSON.stringify({...existing,key:'another-safe-key-999999'}));
    return receipt;
  }});
  assert.deepEqual(result,{state:'blocked',reason:'pending-replaced'});
  assert.equal(saved(c.st).key,'another-safe-key-999999');
});

test('receipt transport failure does not trigger hidden replay',async()=>{
  const c=await setup();await begin(c);
  let writes=0;
  assert.deepEqual(await run(c.options,'check',{
    queryReceipt:async()=>{throw new Error('network down');},
    executePatch:async()=>{writes++;}
  }),{state:'pending',reason:'receipt-transport-unknown'});
  assert.equal(writes,0);
  assert(saved(c.st));
});

test('proof expiry while waiting for host session blocks network before journal is written',async()=>{
  const c=await setup();
  let writes=0;
  await assert.rejects(begin(c,{
    getTrustedSession:async()=>{c.clock.value+=15001;return session;},
    executePatch:async()=>{writes++;return {status:200};}
  }),/expired/);
  assert.equal(writes,0);
  assert.equal(c.st.getItem(P5_R3C_PENDING_KEY),null);
});
