/**
 * P5-R2b (sandbox-only): a browser-compatible, opt-in client for the native AAS
 * synthetic status PATCH contract. Never import into generic Studio mutations.
 *
 * Only a single synthetic operation may be pending per browser storage scope.
 * No bearer tokens, cookies, secrets, or arbitrary record payloads are stored.
 * The caller must explicitly provide an in-memory writer token on every call.
 */
export const P5_PENDING_KEY = 'pattern-atlas:p5-native-synthetic-pending:v1';
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ETAG_PATTERN = /^"[0-9a-f]{64}"$/;
const MODEL_PATTERN = /^p0_case_[1-9][0-9]{0,3}$/;
const STATES = new Set(['draft', 'published', 'evaluated']);

function gatewayOrigin(value) {
  if (typeof value !== 'string') throw new Error('Explicit loopback gateway required');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid loopback gateway URL'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.port || (url.pathname !== '/' && url.pathname !== '')
      || url.username || url.password || url.search || url.hash) {
    throw new Error('Only an explicit HTTP loopback AAS sandbox gateway is allowed');
  }
  return url.origin;
}
function recordNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999999999999) {
    throw new Error('Invalid synthetic model ID');
  }
  return value;
}
function requireToken(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 4096) {
    throw new Error('An in-memory sandbox writer token is required');
  }
  return value;
}
function requireStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function'
      || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('Explicit browser storage is required; do not send without a durable journal');
  }
  return storage;
}
function validatePending(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
      || !KEY_PATTERN.test(value.key) || !ETAG_PATTERN.test(value.etag)
      || !STATES.has(value.status) || value.body !== JSON.stringify({ status: value.status })) {
    throw new Error('Pending P5 mutation journal is malformed; no network mutation allowed');
  }
  recordNumber(value.recordId);
  if (gatewayOrigin(value.origin) !== value.origin) {
    throw new Error('Pending P5 mutation gateway is invalid');
  }
  return value;
}
export function readSyntheticPending(storage) {
  const raw = requireStorage(storage).getItem(P5_PENDING_KEY);
  if (raw === null) return null;
  if (raw.length > 2048) throw new Error('Pending P5 mutation journal exceeds size limit');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Pending P5 mutation journal is not JSON'); }
  return validatePending(parsed);
}
function savePending(storage, operation) {
  if (readSyntheticPending(storage)) {
    throw new Error('A P5 synthetic mutation is unresolved; recover it before any new write');
  }
  const serialized = JSON.stringify(operation);
  storage.setItem(P5_PENDING_KEY, serialized);
  if (storage.getItem(P5_PENDING_KEY) !== serialized) {
    throw new Error('Could not durably persist the mutation request; write was not sent');
  }
}
function clearIfSame(storage, operation) {
  const active = readSyntheticPending(storage);
  if (!active || JSON.stringify(active) !== JSON.stringify(operation)) {
    throw new Error('Pending P5 mutation changed; refusing to discard recovery evidence');
  }
  storage.removeItem(P5_PENDING_KEY);
}
async function boundedJson(response) {
  const raw = await response.text();
  if (raw.length > 16384) throw new Error('AAS response exceeds client validation bound');
  return JSON.parse(raw);
}
function recordMatches(payload, operation) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    && payload.data && typeof payload.data === 'object'
    && payload.data.id === operation.recordId
    && payload.data.status === operation.status;
}
function result(state, operation, reason) {
  return { state, key: operation.key, recordId: operation.recordId,
    ...(reason ? { reason } : {}) };
}
async function sendExactPatch(operation, writerToken, fetchImpl, storage) {
  let response;
  try {
    response = await fetchImpl(operation.origin + '/api/records/' + operation.recordId, {
      method: 'PATCH',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + writerToken,
        'Content-Type': 'application/json',
        'If-Match': operation.etag,
        'Idempotency-Key': operation.key
      },
      body: operation.body
    });
  } catch {
    return result('pending', operation, 'transport-unknown');
  }
  if (response.status !== 200) {
    return result('pending', operation, 'http-' + response.status);
  }
  try {
    if (!recordMatches(await boundedJson(response), operation)) {
      return result('pending', operation, 'unverified-patch-response');
    }
  } catch {
    return result('pending', operation, 'unverified-patch-response');
  }
  clearIfSame(storage, operation);
  return result('committed', operation);
}
/**
 * A new PATCH is allowed ONLY after a native GET proves p0_case_N fixture data.
 * The exact status-only request and strong ETag are journaled before PATCH.
 * Do not call this function in response to a pending/ambiguous prior write.
 */
export async function beginSyntheticStatusPatch({ origin, recordId, status, writerToken,
  storage, fetchImpl = globalThis.fetch, newKey = () => 'p5_native_' + globalThis.crypto.randomUUID().replaceAll('-', '') }) {
  const target = gatewayOrigin(origin);
  const id = recordNumber(recordId);
  const token = requireToken(writerToken);
  const journal = requireStorage(storage);
  if (!STATES.has(status)) throw new Error('Only native synthetic status changes are supported');
  if (readSyntheticPending(journal)) throw new Error('Resolve the previous P5 mutation first');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch transport is unavailable');
  const key = newKey();
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw new Error('Invalid idempotency key');
  const response = await fetchImpl(target + '/api/records/' + id, {
    method: 'GET', credentials: 'omit', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token }
  });
  if (response.status !== 200) throw new Error('Native model fixture check failed');
  const model = (await boundedJson(response))?.data;
  if (!model || model.id !== id || !MODEL_PATTERN.test(model.experiment_id)) {
    throw new Error('Non-synthetic AAS models cannot use the P5 sandbox client');
  }
  const etag = response.headers.get('ETag');
  if (!ETAG_PATTERN.test(etag || '')) throw new Error('Strong native ETag required');
  const operation = { version: 1, origin: target, recordId: id, status, key, etag,
    body: JSON.stringify({ status }) };
  savePending(journal, operation);
  return sendExactPatch(operation, token, fetchImpl, journal);
}
/**
 * Only checks an existing key by default; it never sends a new write.
 * The operator may explicitly request replayIfMissing to resend the SAME
 * method/path/ETag/body/key after 404 from this exact sandbox endpoint.
 * A 404 is NOT evidence that a different backend did not commit.
 */
export async function recoverSyntheticStatusPatch({ writerToken, storage,
  fetchImpl = globalThis.fetch, replayIfMissing = false }) {
  const journal = requireStorage(storage);
  const operation = readSyntheticPending(journal);
  if (!operation) return { state: 'idle' };
  const token = requireToken(writerToken);
  if (typeof fetchImpl !== 'function') throw new Error('Fetch transport is unavailable');
  let response;
  try {
    response = await fetchImpl(operation.origin + '/api/mutations/' + operation.key, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token }
    });
  } catch {
    return result('pending', operation, 'receipt-query-unavailable');
  }
  if (response.status === 200) {
    try {
      const receipt = await boundedJson(response);
      if (receipt?.status !== 'committed' || receipt.recordId !== operation.recordId
          || !recordMatches(receipt.response, operation)) {
        return result('pending', operation, 'unverified-receipt');
      }
      clearIfSame(journal, operation);
      return result('committed', operation);
    } catch {
      return result('pending', operation, 'unverified-receipt');
    }
  }
  if (response.status === 404 && replayIfMissing === true) {
    return sendExactPatch(operation, token, fetchImpl, journal);
  }
  return result('pending', operation,
    response.status === 404 ? 'receipt-not-found-no-replay' : 'receipt-http-' + response.status);
}
