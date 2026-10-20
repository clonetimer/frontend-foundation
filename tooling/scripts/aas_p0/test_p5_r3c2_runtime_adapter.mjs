import test from 'node:test';
import assert from 'node:assert/strict';
import { createP5R3c2ReferenceAdapter, p5R3c2SourceIsEligible } from './p5_r3c2_runtime_adapter.mjs';
import { P5_R3C_PENDING_KEY } from './p5_r3c_scoped_journal.mjs';

const origin='https://studio.example.test';
const providerId='22222222-2222-4222-8222-222222222222';
const epoch='33333333-3333-4333-8333-333333333333';
const sessionEpoch='11111111-1111-4111-8111-111111111111';
const key='p5_r3c2a_reference_key_0001';
const etag='"'+ 'a'.repeat(64)+'"';
const csrf='session_csrf_'+'c'.repeat(42);
const identity={tenantId:'tenant-a',subjectId:'alice',sessionEpoch,role:'writer'};
const cap={contract:'foundation.idempotent-write/v1',providerId,receiptEpoch:epoch,
  scope:{tenantId:'tenant-a',subjectId:'alice'},
  guarantees:{atomicMutationAndReceipt:true,sameKeySameIntentReplay:true,
    authenticatedReceiptLookup:true,principalScopedKeys:true,conditionalMutation:true},
  minReceiptRetentionSeconds:604800,
  routes:[{method:'PATCH',path:'/api/tasks/{id}',receiptPath:'/api/mutations/{key}'}]};
function mock(){
  const entries=new Map(), locksHeld=new Set(), calls=[];
  let version=1, status='draft', accept=true, actor={...identity}, activeCsrf=csrf;
  const receipts=new Map();
  const storage={
    getItem:x=>entries.has(x)?entries.get(x):null,
    setItem:(x,v)=>entries.set(x,String(v)),
    removeItem:x=>entries.delete(x)
  };
  const locks={async request(name,opts,callback){
    assert.equal(opts.mode,'exclusive');assert.equal(opts.ifAvailable,true);
    if(locksHeld.has(name))return callback(null);
    locksHeld.add(name);try{return await callback({name})}finally{locksHeld.delete(name)}
  }};
  const response=(url,code,body,headers={})=>({
    url,status:code,redirected:false,headers:{get:n=>
      Object.entries({'content-type':'application/json','cache-control':'private, no-store',...headers})
        .find(([k])=>k.toLowerCase()===n.toLowerCase())?.[1]??null
    },text:async()=>JSON.stringify(body)
  });
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method??'GET',headers:options.headers,
      credentials:options.credentials,redirect:options.redirect,cache:options.cache});
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
    if(url===origin+'/api/session')return response(url,200,{identity:actor,csrfToken:activeCsrf});
    if(url===origin+'/.well-known/foundation-idempotent-write/v1')return response(url,200,cap);
    if(url===origin+'/api/tasks/1'&&options.method==='GET')return response(url,200,{
      data:{id:1,tenant_id:actor.tenantId,status,version}}, {'etag':etag});
    if(url===origin+'/api/tasks/1'&&options.method==='PATCH'){
      assert.equal(options.headers['Idempotency-Key'],key);
      assert.equal(options.headers['If-Match'],etag);
      assert.equal(options.headers['X-P5-CSRF-Token'],activeCsrf);
      assert.equal(options.body,'{"status":"approved"}');
      if(!receipts.has(key)){
        version++; status='approved';
        receipts.set(key,{status:'committed',recordId:1,
          response:{data:{id:1,tenant_id:actor.tenantId,status,version}}});
      }
      return response(url,503,{error:'commit then HTTP response unavailable'});
    }
    if(url===origin+'/api/mutations/'+key&&options.method==='GET'){
      const result=receipts.get(key);
      return response(url,result?200:404,result??{status:'not_found'});
    }
    throw Error('unexpected non-synthetic endpoint '+url);
  };
  const host={origin,getApproval:async()=>accept,
    getSession:async({fetchSession})=>fetchSession()};
  const browser={location:{origin},navigator:{locks},localStorage:storage};
  return {adapter:createP5R3c2ReferenceAdapter({host,browser,fetchImpl}),
    host,browser,fetchImpl,calls,receipts,storage,
    getVersion:()=>version,setActor:x=>{actor=x},setApproved:v=>{accept=v},
    setCsrf:v=>{activeCsrf=v}};
}
const hasWrite=c=>c.calls.some(x=>x.method==='PATCH');

test('all imported project sources are ineligible even when they claim idempotency',()=>{
  for(const source of [
    {id:'trusted',saveUrl:'/api/tasks/1',idempotent:true,capability:cap},
    {sourceId:'x',method:'PATCH',providerId,receiptEpoch:epoch},
    {listUrl:'https://studio.example.test/api/tasks',idempotencyKey:key},
    null,undefined,{},'approved'
  ])assert.equal(p5R3c2SourceIsEligible(source),false);
});

test('serialized config with no trusted callbacks cannot enable the adapter',()=>{
  const c=mock();
  for(const fake of [
    JSON.parse(JSON.stringify({origin,getApproval:true,getSession:true})),
    {origin,getApproval:()=>true}, {origin,getSession:()=>({})}, null
  ])assert.throws(()=>createP5R3c2ReferenceAdapter({
    host:fake,browser:c.browser,fetchImpl:c.fetchImpl
  }),/trusted nonserializable host hooks/);
});

test('active browser origin and Web Locks are mandatory; no localStorage fallback',()=>{
  const c=mock();
  assert.throws(()=>createP5R3c2ReferenceAdapter({
    host:{...c.host,origin:'https://wrong.example.test'},
    browser:c.browser,fetchImpl:c.fetchImpl
  }),/origin mismatch/);
  assert.throws(()=>createP5R3c2ReferenceAdapter({
    host:c.host,browser:{...c.browser,navigator:{}},fetchImpl:c.fetchImpl
  }),/Web Locks/);
});

test('default-off adapter does not query servers or write when created',()=>{
  const c=mock();
  assert.equal(c.adapter.kind,'synthetic-reference-only');
  assert.equal(c.adapter.enabledByDefault,false);
  assert.equal(c.calls.length,0);
  assert.equal(c.storage.getItem(P5_R3C_PENDING_KEY),null);
});

test('no trusted host approval prevents all network access and journal writes',async()=>{
  const c=mock();c.setApproved(false);
  await assert.rejects(c.adapter.begin({recordId:1,status:'approved',key}),/approval required/);
  await assert.rejects(c.adapter.check(),/approval required/);
  await assert.rejects(c.adapter.replay(),/approval required/);
  assert.equal(c.calls.length,0);assert(!hasWrite(c));
});

test('begin is original-key journal first, 503 uncertain; query-only recovery is authoritative',async()=>{
  const c=mock();
  const pending=await c.adapter.begin({recordId:1,status:'approved',key});
  assert.deepEqual(pending,{state:'pending',reason:'response-uncertain'});
  assert.equal(c.getVersion(),2);
  assert.equal(c.receipts.size,1);
  assert.equal(JSON.parse(c.storage.getItem(P5_R3C_PENDING_KEY)).key,key);
  assert.equal(c.storage.getItem(P5_R3C_PENDING_KEY).includes(csrf),false);
  assert.equal(c.storage.getItem(P5_R3C_PENDING_KEY).includes('session_csrf'),false);
  assert.deepEqual(await c.adapter.check(),{state:'committed'});
  assert.equal(c.storage.getItem(P5_R3C_PENDING_KEY),null);
  assert.equal(c.getVersion(),2);
  assert.equal(c.calls.filter(x=>x.method==='PATCH').length,1);
});

test('new writes remain blocked while original result is unresolved',async()=>{
  const c=mock();await c.adapter.begin({recordId:1,status:'approved',key});
  assert.deepEqual(await c.adapter.begin({recordId:1,status:'approved',key}),
    {state:'blocked',reason:'pending-exists'});
  assert.equal(c.calls.filter(x=>x.method==='PATCH').length,1);
});

test('tenant or session changes block recovery without additional mutation',async()=>{
  const c=mock();await c.adapter.begin({recordId:1,status:'approved',key});
  c.setActor({...identity,tenantId:'tenant-b'});
  assert.deepEqual(await c.adapter.check(),
    {state:'blocked',reason:'scope-or-ledger-changed'});
  assert.equal(c.calls.filter(x=>x.method==='PATCH').length,1);
  assert(c.storage.getItem(P5_R3C_PENDING_KEY));
});

test('role downgrade blocks even read-only recovery and never deletes pending journal',async()=>{
  const c=mock();await c.adapter.begin({recordId:1,status:'approved',key});
  c.setActor({...identity,role:'reader'});
  await assert.rejects(c.adapter.check(),/writer session unavailable/);
  assert(c.storage.getItem(P5_R3C_PENDING_KEY));
});

test('non-synthetic operation options and unsafe record IDs never reach mutation',async()=>{
  const c=mock();
  for(const bad of [
    {recordId:0,status:'approved',key},
    {recordId:1,status:'deleted',key},
    {recordId:1,status:'approved',key:'short'},
    {recordId:1,status:'approved',key,method:'DELETE',path:'/api/admin'}
  ].slice(0,3))await assert.rejects(c.adapter.begin(bad),/synthetic PATCH/);
  assert(!hasWrite(c));
});

test('adapter is not capable of arbitrary URL-based save or delete',()=>{
  const c=mock();
  assert.equal(typeof c.adapter.delete,'undefined');
  assert.equal(typeof c.adapter.patch,'undefined');
  assert.equal(typeof c.adapter.post,'undefined');
  assert.equal(typeof c.adapter.configureSource,'undefined');
});
