/**
 * P5-R3a: strict, read-only contract gate for FUTURE production adapters.
 *
 * This module NEVER sends a mutation or stores credentials/capability grants.
 * An authenticated same-origin server declaration is necessary but never
 * sufficient: verifiedIdentity MUST originate from the host auth subsystem,
 * not user-imported Studio configuration, URLs, or untrusted response data.
 */
export const P5_CAPABILITY_PATH = '/.well-known/foundation-idempotent-write/v1';
export const P5_CAPABILITY_VERSION = 'foundation.idempotent-write/v1';
export const P5_CAPABILITY_MAX_AGE_MS = 15_000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = new Set(['POST', 'PATCH', 'DELETE']);
// An imported file or a manually constructed object cannot grant write capability.
const issuedFromAuthenticatedDiscovery = new WeakSet();
const TEMPLATE = /^\/api\/(?:[a-z][a-z0-9-]{0,39}\/){0,6}[a-z][a-z0-9-]{0,39}(?:\/\{id\})?$/;
const RECEIPT_TEMPLATE = /^\/api\/(?:[a-z][a-z0-9-]{0,39}\/){0,6}mutations\/\{key\}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new Error('P5 capability refused: ' + message); };

function trustedOrigin(value) {
  if (typeof value !== 'string' || !value) fail('explicit authenticated application origin required');
  let parsed;
  try { parsed = new URL(value); } catch { fail('invalid application origin'); }
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:'
       && ['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname)))
      || parsed.origin !== value || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    fail('HTTPS origin required except explicit localhost development');
  }
  // In a real browser, 'same-origin' means the currently loaded application,
  // not an arbitrary HTTPS origin provided by an imported project.
  const pageOrigin = globalThis.location?.origin;
  if (typeof pageOrigin === 'string' && pageOrigin && parsed.origin !== pageOrigin) {
    fail('capability discovery must target the active page origin');
  }
  return parsed.origin;
}
function trustedIdentity(input) {
  if (!isObject(input) || !IDENTIFIER.test(input.tenantId ?? '')
      || !IDENTIFIER.test(input.subjectId ?? '') || !UUID.test(input.sessionEpoch ?? '')) {
    fail('trusted host session identity (tenant, subject, epoch) required');
  }
  return input;
}
function normalizedPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !value.startsWith('/')
      || value.startsWith('//') || value.includes('?') || value.includes('#')
      || value.includes('\\') || value.includes('%') || value.includes('..')) {
    fail('unsafe path');
  }
  return value;
}
function routeTemplate(input) {
  const value = normalizedPath(input);
  if (!TEMPLATE.test(value)) fail('invalid operation route template');
  return value;
}
function receiptTemplate(input) {
  const value = normalizedPath(input);
  if (!RECEIPT_TEMPLATE.test(value)) fail('invalid receipt route template');
  return value;
}
function safeRecordId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
}
function operationMatches(route, actual) {
  if (route === actual) return true;
  if (!route.endsWith('/{id}')) return false;
  const prefix = route.slice(0, -4);
  return actual.startsWith(prefix) && safeRecordId(actual.slice(prefix.length));
}
/**
 * Validate a capability value that came from an authenticated, no-store,
 * non-redirected same-origin response. Never treat a Studio file's copy of
 * this object as evidence of server support.
 */
export function validateP5Capability(payload, { origin, verifiedIdentity, checkedAt = Date.now() }) {
  trustedOrigin(origin);
  const identity = trustedIdentity(verifiedIdentity);
  if (!Number.isSafeInteger(checkedAt) || checkedAt <= 0) fail('invalid clock');
  if (!isObject(payload) || payload.contract !== P5_CAPABILITY_VERSION
      || !UUID.test(payload.providerId ?? '') || !UUID.test(payload.receiptEpoch ?? '')
      || !isObject(payload.scope) || !IDENTIFIER.test(payload.scope.tenantId ?? '')
      || !IDENTIFIER.test(payload.scope.subjectId ?? '')
      || payload.scope.tenantId !== identity.tenantId
      || payload.scope.subjectId !== identity.subjectId) {
    fail('incompatible protocol, backend identity, or authenticated scope');
  }
  const flags = payload.guarantees;
  if (!isObject(flags) || flags.atomicMutationAndReceipt !== true
      || flags.sameKeySameIntentReplay !== true
      || flags.authenticatedReceiptLookup !== true
      || flags.principalScopedKeys !== true
      || flags.conditionalMutation !== true) {
    fail('missing mandatory transactional/idempotency guarantees');
  }
  if (!Number.isSafeInteger(payload.minReceiptRetentionSeconds)
      || payload.minReceiptRetentionSeconds < 86_400
      || payload.minReceiptRetentionSeconds > 31_536_000) {
    fail('insufficient or invalid receipt retention declaration');
  }
  if (!Array.isArray(payload.routes) || payload.routes.length < 1 || payload.routes.length > 16) {
    fail('expected one to sixteen explicit operation routes');
  }
  const seen = new Set();
  const routes = payload.routes.map((entry) => {
    if (!isObject(entry) || !METHODS.has(entry.method)) fail('unsupported mutation method');
    const template = routeTemplate(entry.path);
    const receipt = receiptTemplate(entry.receiptPath);
    if (entry.method === 'POST' && template.endsWith('/{id}')) fail('POST create path must not contain id');
    if (entry.method !== 'POST' && !template.endsWith('/{id}')) fail('conditional writes require record id');
    const identifier = entry.method + ':' + template;
    if (seen.has(identifier)) fail('duplicate route declaration');
    seen.add(identifier);
    return Object.freeze({ method: entry.method, path: template, receiptPath: receipt });
  });
  return Object.freeze({
    version: P5_CAPABILITY_VERSION, origin, providerId: payload.providerId,
    receiptEpoch: payload.receiptEpoch, tenantId: identity.tenantId,
    subjectId: identity.subjectId, sessionEpoch: identity.sessionEpoch,
    checkedAt, retentionSeconds: payload.minReceiptRetentionSeconds,
    routes: Object.freeze(routes)
  });
}
/**
 * Fetch from a FIXED same-origin path with ambient first-party session only.
 * This is metadata negotiation, not authorization to issue writes.
 */
export async function discoverP5Capability({
  origin, verifiedIdentity, fetchImpl = globalThis.fetch, now = Date.now
}) {
  const target = trustedOrigin(origin);
  trustedIdentity(verifiedIdentity);
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') fail('transport unavailable');
  const url = target + P5_CAPABILITY_PATH;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', credentials: 'same-origin', redirect: 'error',
      cache: 'no-store', headers: { Accept: 'application/json' }
    });
  } catch { fail('read-only capability request failed'); }
  if (!response || response.status !== 200 || response.redirected === true
      || (response.url && response.url !== url)) fail('unexpected status or redirect');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
    fail('JSON content type required');
  }
  if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') || '')) {
    fail('server must prohibit capability caching');
  }
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (declaredLength > 8192) fail('capability response exceeds 8 KB');
  let payload;
  try {
    const body = await response.text();
    if (body.length > 8192) fail('capability response exceeds 8 KB');
    payload = JSON.parse(body);
  } catch { fail('invalid capability response'); }
  const verified = validateP5Capability(payload, {
    origin: target, verifiedIdentity, checkedAt: now()
  });
  issuedFromAuthenticatedDiscovery.add(verified);
  return verified;
}
/**
 * A point-in-time, fail-closed write PLAN check. It does not send anything.
 * An adapter must recheck the verified host identity and backend epoch BEFORE
 * every new mutation AND original-key receipt query/replay.
 */
export function authorizeP5WritePlan({
  capability, origin, verifiedIdentity, method, path,
  expectedProviderId, expectedReceiptEpoch, now = Date.now()
}) {
  const target = trustedOrigin(origin);
  const identity = trustedIdentity(verifiedIdentity);
  if (!isObject(capability) || !issuedFromAuthenticatedDiscovery.has(capability)
      || capability.version !== P5_CAPABILITY_VERSION
      || capability.origin !== target || capability.tenantId !== identity.tenantId
      || capability.subjectId !== identity.subjectId
      || capability.sessionEpoch !== identity.sessionEpoch
      || !UUID.test(capability.providerId ?? '')
      || !UUID.test(capability.receiptEpoch ?? '')
      || capability.providerId !== expectedProviderId
      || capability.receiptEpoch !== expectedReceiptEpoch) {
    fail('provider, receipt epoch, or authenticated session changed');
  }
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(capability.checkedAt)
      || now < capability.checkedAt || now - capability.checkedAt > P5_CAPABILITY_MAX_AGE_MS) {
    fail('capability proof expired or clock moved');
  }
  if (!METHODS.has(method)) fail('unrecognized method');
  const canonicalPath = normalizedPath(path);
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(canonicalPath)) fail('invalid concrete path');
  if (!Array.isArray(capability.routes)) fail('routes missing');
  const route = capability.routes.find((item) => item?.method === method
    && operationMatches(item.path, canonicalPath));
  if (!route) fail('endpoint is not explicitly authorized');
  return Object.freeze({
    origin: target, method, path: canonicalPath,
    receiptPath: route.receiptPath, providerId: capability.providerId,
    receiptEpoch: capability.receiptEpoch, tenantId: identity.tenantId,
    subjectId: identity.subjectId, sessionEpoch: identity.sessionEpoch
  });
}
