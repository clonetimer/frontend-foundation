/**
 * P5-R3c: CONSERVATIVE, SYNTHETIC-ONLY, single-origin/browser-profile journal.
 *
 * No application mutations are performed by this module except through
 * explicitly supplied callbacks. The journal contains no cookie, bearer or
 * CSRF token. All create/check/replay paths require the origin-wide Web Locks
 * exclusive lock; no navigator.locks -> no writes, no fallback/localStorage lock.
 *
 * This is not a production login, multi-device lease or exported Studio API.
 */
import { authorizeP5WritePlan } from './p5_capability_contract.mjs';

export const P5_R3C_PENDING_KEY = 'foundation:p5-r3c:synthetic-pending:v1';
export const P5_R3C_LOCK_NAME = 'foundation:p5-r3c:synthetic-journal:exclusive:v1';
const OWN = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const KEY = /^[A-Za-z0-9_-]{16,128}$/;
const PATH = /^\/api\/tasks\/([1-9][0-9]{0,9})$/;
const ETAG = /^"[0-9a-f]{64}"$/;
const STATUSES = new Set(['draft', 'approved', 'archived']);
const FIELDS = ['version','origin','tenantId','subjectId','sessionEpoch',
  'providerId','receiptEpoch','method','path','key','etag','status','body'];
function refuse(message) { throw new Error('P5-R3c journal refused: ' + message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validateStorage(storage) {
  if (!storage || !['getItem','setItem','removeItem'].every(x => typeof storage[x] === 'function')) {
    refuse('browser storage unavailable');
  }
}
function validateRecord(record) {
  if (!object(record) || Object.keys(record).length !== FIELDS.length
      || !FIELDS.every(field => OWN(record, field))
      || record.version !== 1 || typeof record.origin !== 'string'
      || !/^https?:\/\/[^/@?#]+$/.test(record.origin)
      || ![record.tenantId,record.subjectId].every(x => typeof x === 'string' && ID.test(x))
      || ![record.sessionEpoch,record.providerId,record.receiptEpoch].every(x => typeof x === 'string' && UUID.test(x))
      || record.method !== 'PATCH' || typeof record.path !== 'string' || !PATH.test(record.path)
      || typeof record.key !== 'string' || !KEY.test(record.key)
      || typeof record.etag !== 'string' || !ETAG.test(record.etag)
      || !STATUSES.has(record.status) || record.body !== JSON.stringify({status:record.status})){
    refuse('damaged, unrecognized or unscoped pending record; do not erase/retry');
  }
  return record;
}
export function readP5R3cPending(storage) {
  validateStorage(storage);
  const raw = storage.getItem(P5_R3C_PENDING_KEY);
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.length > 2500) refuse('oversized pending record');
  let value;
  try { value = JSON.parse(raw); }
  catch { refuse('unparseable pending record'); }
  return Object.freeze(validateRecord(value));
}
function sameActor(a,b) {
  return !!a && !!b && a.tenantId === b.tenantId && a.subjectId === b.subjectId
      && a.sessionEpoch === b.sessionEpoch;
}
function trustedSession(session, identity) {
  if (!object(session) || !object(session.identity) || !sameActor(session.identity, identity)
      || session.identity.role !== 'writer'
      || typeof session.csrfToken !== 'string' || session.csrfToken.length < 32) {
    refuse('trusted writer session unavailable, changed or revoked');
  }
  return session;
}
function permission(args, path) {
  return authorizeP5WritePlan({
    capability: args.capability, origin: args.origin,
    verifiedIdentity: args.verifiedIdentity,
    method: 'PATCH', path,
    expectedProviderId: args.expectedProviderId,
    expectedReceiptEpoch: args.expectedReceiptEpoch,
    now: args.now?.() ?? Date.now()
  });
}
function matches(record, plan, identity) {
  return record.origin === plan.origin
      && record.path === plan.path
      && record.tenantId === identity.tenantId
      && record.subjectId === identity.subjectId
      && record.sessionEpoch === identity.sessionEpoch
      && record.providerId === plan.providerId
      && record.receiptEpoch === plan.receiptEpoch;
}
function receiptValid(raw, record) {
  if (!object(raw) || raw.status !== 200 || !object(raw.body)
      || raw.body.status !== 'committed'
      || raw.body.recordId !== Number(PATH.exec(record.path)?.[1])
      || !object(raw.body.response) || !object(raw.body.response.data)) return false;
  const item = raw.body.response.data;
  return item.tenant_id === record.tenantId && item.id === raw.body.recordId
      && item.status === record.status && Number.isSafeInteger(item.version)
      && item.version >= 2;
}
function makeRecord(args, plan) {
  const request = args.request;
  if (!object(request) || !PATH.test(request.path ?? '')
      || request.method !== 'PATCH' || !KEY.test(request.key ?? '')
      || !ETAG.test(request.etag ?? '') || !STATUSES.has(request.status)
      || request.body !== JSON.stringify({status:request.status})) {
    refuse('synthetic PATCH requires exact body, id, strong ETag and original key');
  }
  return validateRecord({
    version:1, origin:plan.origin, tenantId:args.verifiedIdentity.tenantId,
    subjectId:args.verifiedIdentity.subjectId, sessionEpoch:args.verifiedIdentity.sessionEpoch,
    providerId:plan.providerId, receiptEpoch:plan.receiptEpoch,
    method:'PATCH', path:request.path, key:request.key, etag:request.etag,
    status:request.status, body:request.body
  });
}
/**
 * action = 'begin' | 'check' | 'replay'.
 * - begin journals BEFORE the only PATCH attempt; even HTTP 200 remains pending
 *   until an authenticated original-key receipt verifies success.
 * - check only queries the receipt. 404 remains UNKNOWN, never silently retries.
 * - replay requires explicit confirmReplay, queries receipt first, and only
 *   if receipt is EXACT 404 sends one identical request; never creates a key.
 *
 * Browser Web Locks are atomic only for cooperating same-origin contexts,
 * not cross-device and not a distributed fencing token. Backend idempotency
 * and strong CAS remain mandatory. ifAvailable prevents silent queuing.
 */
export async function runP5R3cOperation(args) {
  if (!object(args) || !['begin','check','replay'].includes(args.action)) refuse('unknown action');
  validateStorage(args.storage);
  if (typeof args.getTrustedSession !== 'function') refuse('trusted host session provider required');
  if (!args.lockManager || typeof args.lockManager.request !== 'function') {
    refuse('Web Locks unavailable; no localStorage mutex fallback');
  }
  if (args.action === 'begin' && typeof args.executePatch !== 'function') refuse('write callback missing');
  if (args.action !== 'begin' && typeof args.queryReceipt !== 'function') refuse('receipt callback missing');
  if (args.action === 'replay' && (args.confirmReplay !== true
      || typeof args.executePatch !== 'function')) refuse('explicit replay approval required');

  return args.lockManager.request(P5_R3C_LOCK_NAME,
    {mode:'exclusive', ifAvailable:true}, async lock => {
      if (!lock) return {state:'busy'};
      const pending = readP5R3cPending(args.storage);
      if (args.action === 'begin' && pending) return {state:'blocked',reason:'pending-exists'};
      if (args.action !== 'begin' && !pending) return {state:'idle'};
      const path = args.action === 'begin' ? args.request?.path : pending.path;
      // The R3a proof must have been acquired from authenticated same-origin
      // discovery, not imported, forged or copied out of a prior page session.
      if (pending && (pending.origin !== args.origin
          || pending.tenantId !== args.verifiedIdentity?.tenantId
          || pending.subjectId !== args.verifiedIdentity?.subjectId
          || pending.sessionEpoch !== args.verifiedIdentity?.sessionEpoch
          || pending.providerId !== args.expectedProviderId
          || pending.receiptEpoch !== args.expectedReceiptEpoch)) {
        return {state:'blocked',reason:'scope-or-ledger-changed'};
      }
      const plan = permission(args, path);
      if (pending && !matches(pending, plan, args.verifiedIdentity)) {
        return {state:'blocked',reason:'scope-or-ledger-changed'};
      }
      const session = trustedSession(await args.getTrustedSession(), args.verifiedIdentity);
      // The authenticated session read is asynchronous: a previously fresh
      // capability may expire while awaiting it. Recheck inside the lock
      // immediately before IO, rather than trusting pre-await permission.
      permission(args, path);
      // Check once more under the same exclusive lock after the auth await.
      if (args.action === 'begin') {
        if (readP5R3cPending(args.storage)) return {state:'blocked',reason:'pending-exists'};
        const record = makeRecord(args, plan);
        args.storage.setItem(P5_R3C_PENDING_KEY, JSON.stringify(record));
        try {
          const result = await args.executePatch({
            plan, record:Object.freeze(record), session
          });
          return {state:'pending', reason:result?.status === 200 ?
            'await-original-receipt' : 'response-uncertain'};
        } catch {
          return {state:'pending',reason:'transport-unknown'};
        }
      }
      if (!matches(readP5R3cPending(args.storage), plan, args.verifiedIdentity)) {
        return {state:'blocked',reason:'pending-replaced'};
      }
      let response;
      try { response = await args.queryReceipt({plan,record:pending,session}); }
      catch { return {state:'pending',reason:'receipt-transport-unknown'}; }
      if (receiptValid(response, pending)) {
        // Only our own, unchanged journal may be removed; fail closed otherwise.
        if (JSON.stringify(readP5R3cPending(args.storage)) !== JSON.stringify(pending)) {
          return {state:'blocked',reason:'pending-replaced'};
        }
        args.storage.removeItem(P5_R3C_PENDING_KEY);
        return {state:'committed'};
      }
      if (response?.status === 410) return {state:'blocked',reason:'receipt-expired'};
      if (response?.status === 409) return {state:'blocked',reason:'receipt-epoch-conflict'};
      if (response?.status === 401 || response?.status === 403) {
        return {state:'blocked',reason:'authorization-revoked'};
      }
      if (response?.status !== 404) return {state:'pending',reason:'receipt-unverified'};
      if (args.action !== 'replay') return {state:'pending',reason:'receipt-not-found'};
      // Replay 404 alone cannot prove the previous request did not commit.
      // Server guarantees SAME-KEY original-body idempotency and a durable
      // spent-key tombstone; do not run without fresh proof and permission.
      permission(args, pending.path);
      const renewedSession = trustedSession(await args.getTrustedSession(), args.verifiedIdentity);
      permission(args, pending.path);
      if (JSON.stringify(readP5R3cPending(args.storage)) !== JSON.stringify(pending)) {
        return {state:'blocked',reason:'pending-replaced'};
      }
      try {
        const result = await args.executePatch({plan,record:pending,session:renewedSession});
        return {state:'pending',reason:result?.status === 200 ?
          'await-original-receipt' : 'replay-uncertain'};
      } catch {
        return {state:'pending',reason:'transport-unknown'};
      }
    });
}
