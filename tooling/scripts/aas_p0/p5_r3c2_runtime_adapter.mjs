/**
 * P5-R3c2a: portable, explicitly opt-in, SYNTHETIC-ONLY recovery adapter.
 * Studio and standalone ZIP may share these bytes, but ordinary data sources
 * and project JSON never authorize a write. No implicit mutations.
 */
import { discoverP5Capability } from './p5_capability_contract.mjs';
import { readP5R3cPending, runP5R3cOperation } from './p5_r3c_scoped_journal.mjs';

const TASK=/^\/api\/tasks\/([1-9][0-9]{0,9})$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const ETAG=/^"[a-f0-9]{64}"$/;
const STATUSES=new Set(['draft','approved','archived']);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function refuse(reason){throw new Error('P5-R3c2a reference adapter refused: '+reason)}
function checkedOrigin(origin,browser){
  if(typeof origin!=='string'||origin!==browser?.location?.origin)refuse('active browser origin mismatch');
  let url;try{url=new URL(origin)}catch{refuse('invalid origin')}
  if(url.origin!==origin||url.pathname!=='/'||url.search||url.hash
    ||(url.protocol!=='https:'&&!(url.protocol==='http:'
      &&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))refuse('HTTPS or loopback required');
  return origin;
}
function validateSession(value){
  if(!object(value)||!object(value.identity)
    ||![value.identity.tenantId,value.identity.subjectId].every(s=>typeof s==='string'&&ID.test(s))
    ||!UUID.test(value.identity.sessionEpoch??'')||value.identity.role!=='writer'
    ||typeof value.csrfToken!=='string'||value.csrfToken.length<32||value.csrfToken.length>256){
    refuse('current trusted writer session unavailable');
  }
  return value;
}
async function jsonResponse(response){
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')??'')){
    refuse('same-origin JSON required');
  }
  const raw=await response.text();
  if(raw.length>8192)refuse('response too large');
  try{return JSON.parse(raw)}catch{refuse('invalid JSON response')}
}
function confirmResponse(response,url,status){
  if(!response||response.status!==status||response.redirected===true
    ||(response.url&&response.url!==url))refuse('unexpected HTTP status or redirect');
}
/**
 * Requires runtime functions from a TRUSTED same-origin host, never imported
 * serialized project data. The only eligible path is /api/tasks/{id}.
 * The object is not attached to WidgetPreview, StudioRecords or workflows.
 */
export function createP5R3c2ReferenceAdapter({host,browser=globalThis,fetchImpl=globalThis.fetch}){
  if(!object(host)||typeof host.getApproval!=='function'||typeof host.getSession!=='function'){
    refuse('trusted nonserializable host hooks required');
  }
  const origin=checkedOrigin(host.origin,browser);
  if(typeof fetchImpl!=='function'||!browser.navigator?.locks
    ||typeof browser.navigator.locks.request!=='function'||!browser.localStorage){
    refuse('Web Locks, browser storage and fetch are mandatory');
  }
  async function request(path,options={}){
    const url=origin+path;
    const response=await fetchImpl(url,{
      credentials:'same-origin',redirect:'error',cache:'no-store',...options
    });
    if(!response||response.redirected===true||(response.url&&response.url!==url)){
      refuse('unexpected redirect or cross-origin response');
    }
    return response;
  }
  async function session(){
    return validateSession(await host.getSession({
      origin,
      fetchSession:async()=>{
        const response=await request('/api/session',{method:'GET'});
        confirmResponse(response,origin+'/api/session',200);
        if(!(response.headers.get('cache-control')??'').includes('no-store')){
          refuse('session response must not be cached');
        }
        return jsonResponse(response);
      }
    }));
  }
  const patch=async({record,session:active})=>{
    const response=await request(record.path,{
      method:'PATCH',headers:{
        'content-type':'application/json',
        'X-P5-CSRF-Token':active.csrfToken,
        'If-Match':record.etag,'Idempotency-Key':record.key,
        'X-P5-Provider-Id':record.providerId,
        'X-P5-Receipt-Epoch':record.receiptEpoch
      },body:record.body
    });
    return {status:response.status};
  };
  const queryReceipt=async({record})=>{
    const response=await request('/api/mutations/'+record.key,{
      method:'GET',headers:{
        'X-P5-Provider-Id':record.providerId,
        'X-P5-Receipt-Epoch':record.receiptEpoch
      }
    });
    return {status:response.status,
      body:response.status===200?await jsonResponse(response):null};
  };
  async function execute(action,args={}){
    if(!['begin','check','replay'].includes(action))refuse('unrecognized action');
    if(action==='begin'&&(!Number.isSafeInteger(args.recordId)||args.recordId<1
      ||args.recordId>9_999_999_999||!STATUSES.has(args.status)||!KEY.test(args.key??''))){
      refuse('only status-only synthetic PATCH and original key allowed');
    }
    if(await host.getApproval({action,origin,fixtureOnly:true})!==true){
      refuse('explicit trusted host approval required');
    }
    const initial=await session();
    const previous=readP5R3cPending(browser.localStorage);
    // Identity changed: block before even reading a new provider's capability.
    // The previously stored request must remain untouched for manual review.
    if(previous&&(previous.origin!==origin
      ||previous.tenantId!==initial.identity.tenantId
      ||previous.subjectId!==initial.identity.subjectId
      ||previous.sessionEpoch!==initial.identity.sessionEpoch)){
      return {state:'blocked',reason:'scope-or-ledger-changed'};
    }
    const proof=await discoverP5Capability({
      origin,verifiedIdentity:initial.identity,fetchImpl,now:Date.now
    });
    if(previous&&(previous.providerId!==proof.providerId
      ||previous.receiptEpoch!==proof.receiptEpoch)){
      return {state:'blocked',reason:'scope-or-ledger-changed'};
    }
    let mutation;
    if(action==='begin'&&!previous){
      const path='/api/tasks/'+args.recordId;
      if(!TASK.test(path))refuse('synthetic task route only');
      const response=await request(path,{method:'GET'});
      confirmResponse(response,origin+path,200);
      const etag=response.headers.get('etag');
      if(!ETAG.test(etag??''))refuse('strong native ETag required');
      const payload=await jsonResponse(response);
      if(!object(payload)||!object(payload.data)
        ||payload.data.id!==args.recordId
        ||payload.data.tenant_id!==initial.identity.tenantId){
        refuse('server task id/tenant mismatch');
      }
      mutation={method:'PATCH',path,key:args.key,etag,
        status:args.status,body:JSON.stringify({status:args.status})};
    }
    return runP5R3cOperation({
      action,origin,verifiedIdentity:initial.identity,capability:proof,
      expectedProviderId:previous?.providerId??proof.providerId,
      expectedReceiptEpoch:previous?.receiptEpoch??proof.receiptEpoch,
      lockManager:browser.navigator.locks,storage:browser.localStorage,
      getTrustedSession:session,request:mutation,
      executePatch:patch,queryReceipt,
      confirmReplay:action==='replay'
    });
  }
  return Object.freeze({
    kind:'synthetic-reference-only',
    enabledByDefault:false,
    pending:()=>readP5R3cPending(browser.localStorage),
    begin:args=>execute('begin',args),
    check:()=>execute('check'),
    replay:()=>execute('replay')
  });
}
/** A serialized Studio project/source can NEVER opt into this protocol. */
export function p5R3c2SourceIsEligible(source){
  void source;
  return false;
}
