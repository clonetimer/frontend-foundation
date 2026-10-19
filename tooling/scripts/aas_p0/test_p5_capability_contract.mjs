import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P5_CAPABILITY_PATH, P5_CAPABILITY_VERSION, P5_CAPABILITY_MAX_AGE_MS,
  discoverP5Capability, validateP5Capability, authorizeP5WritePlan
} from './p5_capability_contract.mjs';

const ORIGIN = 'https://app.example.test';
const IDENTITY = Object.freeze({
  tenantId: 'tenant-42', subjectId: 'operator-7',
  sessionEpoch: '11111111-1111-4111-8111-111111111111'
});
const PROVIDER = '22222222-2222-4222-8222-222222222222';
const EPOCH = '33333333-3333-4333-8333-333333333333';
const TIME = 1_792_440_000_000;

function example() {
  return {
    contract: P5_CAPABILITY_VERSION, providerId: PROVIDER, receiptEpoch: EPOCH,
    scope: { tenantId: IDENTITY.tenantId, subjectId: IDENTITY.subjectId },
    guarantees: {
      atomicMutationAndReceipt: true, sameKeySameIntentReplay: true,
      authenticatedReceiptLookup: true, principalScopedKeys: true,
      conditionalMutation: true
    },
    minReceiptRetentionSeconds: 604800,
    routes: [
      { method: 'PATCH', path: '/api/tasks/{id}',
        receiptPath: '/api/mutations/{key}' },
      { method: 'POST', path: '/api/tasks',
        receiptPath: '/api/mutations/{key}' }
    ]
  };
}
function withFakeServer(body = example(), overrides = {}) {
  const requests = [];
  const url = ORIGIN + P5_CAPABILITY_PATH;
  const response = {
    status: 200, redirected: false, url,
    headers: { get(name) {
      return ({ 'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'Content-Length': String(JSON.stringify(body).length)
      })[name] ?? null;
    } },
    text: async () => JSON.stringify(body), ...overrides
  };
  return {
    requests,
    fetchImpl: async (received, options) => { requests.push({ received, options }); return response; }
  };
}
async function discover(server = withFakeServer(), identity = IDENTITY, now = TIME) {
  return discoverP5Capability({
    origin: ORIGIN, verifiedIdentity: identity, fetchImpl: server.fetchImpl, now: () => now
  });
}
const plan = (capability, extra = {}) => authorizeP5WritePlan({
  capability, origin: ORIGIN, verifiedIdentity: IDENTITY, method: 'PATCH',
  path: '/api/tasks/task-7', expectedProviderId: PROVIDER,
  expectedReceiptEpoch: EPOCH, now: TIME + 1000, ...extra
});

test('negotiation is fixed-path, same-origin, credential-scoped, GET-only and no-store', async () => {
  const server = withFakeServer();
  const proof = await discover(server);
  assert.equal(proof.tenantId, IDENTITY.tenantId);
  assert.equal(proof.subjectId, IDENTITY.subjectId);
  assert.equal(proof.providerId, PROVIDER);
  assert.equal(proof.receiptEpoch, EPOCH);
  assert.equal(proof.retentionSeconds, 604800);
  assert.deepEqual(server.requests, [{
    received: ORIGIN + P5_CAPABILITY_PATH, options: {
      method: 'GET', credentials: 'same-origin', redirect: 'error',
      cache: 'no-store', headers: { Accept: 'application/json' }
    }
  }]);
  assert.equal(Object.isFrozen(proof), true);
  assert.equal(Object.isFrozen(proof.routes), true);
  assert.equal(Object.isFrozen(proof.routes[0]), true);
});

test('a live discovered capability grants only its exact declared method, path and scope', async () => {
  const capability = await discover();
  const receiptPlan = plan(capability);
  assert.deepEqual(receiptPlan, {
    origin: ORIGIN, method: 'PATCH', path: '/api/tasks/task-7',
    receiptPath: '/api/mutations/{key}', providerId: PROVIDER,
    receiptEpoch: EPOCH, tenantId: IDENTITY.tenantId,
    subjectId: IDENTITY.subjectId, sessionEpoch: IDENTITY.sessionEpoch
  });
  assert(Object.isFrozen(receiptPlan));
  assert.throws(() => plan(capability, { method: 'DELETE' }), /explicitly authorized/);
  assert.throws(() => plan(capability, { path: '/api/users/task-7' }), /explicitly authorized/);
  assert.throws(() => plan(capability, { path: '/api/tasks/task-7?admin=1' }), /unsafe path/);
  assert.throws(() => plan(capability, { path: '/api/tasks/%2e%2e' }), /unsafe path/);
  assert.throws(() => plan(capability, { path: '//evil.example/api/tasks' }), /unsafe path/);
});

test('project-stored or manually validated capabilities are never write grants', async () => {
  const readOnly = validateP5Capability(example(), {
    origin: ORIGIN, verifiedIdentity: IDENTITY, checkedAt: TIME
  });
  assert.throws(() => plan(readOnly), /provider, receipt epoch, or authenticated session changed/);
  const live = await discover();
  const cloned = JSON.parse(JSON.stringify(live));
  assert.throws(() => plan(cloned), /provider, receipt epoch, or authenticated session changed/);
  assert.equal(plan(live).providerId, PROVIDER);
});

test('cross-tenant, cross-subject and changed host session cannot reuse a grant', async () => {
  const capability = await discover();
  for (const trusted of [
    { ...IDENTITY, tenantId: 'tenant-OTHER' },
    { ...IDENTITY, subjectId: 'operator-OTHER' },
    { ...IDENTITY, sessionEpoch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  ]) assert.throws(() => plan(capability, { verifiedIdentity: trusted }), /changed/);
});

test('server-declared scope is not allowed to override host-authenticated identity', async () => {
  for (const scope of [
    { tenantId: 'other', subjectId: IDENTITY.subjectId },
    { tenantId: IDENTITY.tenantId, subjectId: 'other' }
  ]) {
    const body = example(); body.scope = scope;
    await assert.rejects(discover(withFakeServer(body)), /scope/);
  }
  const body = example(); body.scope = { tenantId: '../admin', subjectId: 'x' };
  await assert.rejects(discover(withFakeServer(body)), /scope/);
});

test('provider migration, wiped receipt epoch and URL origin changes revoke grant', async () => {
  const capability = await discover();
  assert.throws(() => plan(capability, {
    expectedProviderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  }), /changed/);
  assert.throws(() => plan(capability, {
    expectedReceiptEpoch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  }), /changed/);
  assert.throws(() => plan(capability, { origin: 'https://other.example' }), /changed/);
  assert.throws(() => plan(capability, { origin: 'http://app.example.test' }), /HTTPS origin/);
});

test('a stale capability, future clock, or non-integer time cannot authorize mutations', async () => {
  const capability = await discover();
  assert.equal(plan(capability, { now: TIME + P5_CAPABILITY_MAX_AGE_MS }).path, '/api/tasks/task-7');
  assert.throws(() => plan(capability, { now: TIME + P5_CAPABILITY_MAX_AGE_MS + 1 }), /expired/);
  assert.throws(() => plan(capability, { now: TIME - 1 }), /expired/);
  assert.throws(() => plan(capability, { now: Number.NaN }), /expired/);
});

test('no identity means no network request and no anonymous write capability', async () => {
  const server = withFakeServer();
  await assert.rejects(discover(server, null), /trusted host session/);
  assert.equal(server.requests.length, 0);
  assert.throws(() => plan({}), /changed/);
});

test('no arbitrary host, URL-credential, insecure remote HTTP, path or redirect accepted', async () => {
  for (const origin of [
    'http://app.example.test', 'https://app.example.test/evil',
    'https://admin:secret@app.example.test', 'https://app.example.test?token=secret',
    'https://app.example.test/', '//evil.test', 'file:///tmp/data'
  ]) {
    await assert.rejects(discoverP5Capability({
      origin, verifiedIdentity: IDENTITY, fetchImpl: withFakeServer().fetchImpl
    }), /origin|HTTPS/);
  }
  await assert.rejects(discover(withFakeServer(example(), { redirected: true })), /redirect/);
  await assert.rejects(discover(withFakeServer(example(), {
    url: 'https://redirected.example.test/.well-known/foundation-idempotent-write/v1'
  })), /redirect/);
});

test('only authenticated JSON, no-store, bounded 200 responses can be capability evidence', async () => {
  await assert.rejects(discover(withFakeServer(example(), { status: 401 })), /status/);
  await assert.rejects(discover(withFakeServer(example(), { status: 403 })), /status/);
  await assert.rejects(discover(withFakeServer(example(), { status: 404 })), /status/);
  await assert.rejects(discover(withFakeServer(example(), { status: 503 })), /status/);
  for (const headers of [
    { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
    { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    { 'Content-Type': 'application/json', 'Cache-Control': '' },
    { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': '9000' }
  ]) {
    await assert.rejects(discover(withFakeServer(example(), {
      headers: { get: (key) => headers[key] ?? null }
    })), /content|cach|response/);
  }
  await assert.rejects(discover(withFakeServer(example(), {
    text: async () => 'x'.repeat(9000)
  })), /response/);
  await assert.rejects(discover(withFakeServer(example(), {
    text: async () => '<html>not json</html>'
  })), /invalid capability response/);
  await assert.rejects(discover({
    fetchImpl: async () => { throw new TypeError('network unreachable'); }
  }), /request failed/);
});

test('a backend without every transactional guarantee or 24h retention is rejected', async () => {
  for (const feature of [
    'atomicMutationAndReceipt', 'sameKeySameIntentReplay', 'authenticatedReceiptLookup',
    'principalScopedKeys', 'conditionalMutation'
  ]) {
    const body = example(); body.guarantees[feature] = false;
    await assert.rejects(discover(withFakeServer(body)), /guarantees/);
  }
  for (const lifetime of [0, 60, 86399, '86400', 31536001]) {
    const body = example(); body.minReceiptRetentionSeconds = lifetime;
    await assert.rejects(discover(withFakeServer(body)), /retention/);
  }
});

test('malformed, wildcard, cross-resource, traversal, and duplicate route claims are rejected', async () => {
  for (const route of [
    { method: 'PATCH', path: '/api/tasks/{id}/approve', receiptPath: '/api/mutations/{key}' },
    { method: 'PATCH', path: '/api/*/{id}', receiptPath: '/api/mutations/{key}' },
    { method: 'PATCH', path: '/api/tasks/../admin/{id}', receiptPath: '/api/mutations/{key}' },
    { method: 'PATCH', path: 'https://evil.example/', receiptPath: '/api/mutations/{key}' },
    { method: 'PATCH', path: '/api/tasks/%2E%2E/{id}', receiptPath: '/api/mutations/{key}' },
    { method: 'PATCH', path: '/api/tasks/{id}', receiptPath: 'https://evil.example/key' },
    { method: 'PATCH', path: '/api/tasks/{id}', receiptPath: '/api/mutations/{id}' },
    { method: 'POST', path: '/api/tasks/{id}', receiptPath: '/api/mutations/{key}' },
    { method: 'DELETE', path: '/api/tasks', receiptPath: '/api/mutations/{key}' }
  ]) {
    const body = example(); body.routes = [route];
    await assert.rejects(discover(withFakeServer(body)), /path|route|id/);
  }
  const duplicate = example(); duplicate.routes.push(duplicate.routes[0]);
  await assert.rejects(discover(withFakeServer(duplicate)), /duplicate/);
  for (const routes of [[], Array(17).fill(example().routes[0])]) {
    const body = example(); body.routes = routes;
    await assert.rejects(discover(withFakeServer(body)), /sixteen/);
  }
});

test('declarations cannot downgrade version, forge provider identity or enable by self-assertion', async () => {
  for (const bad of [
    { contract: 'foundation.idempotent-write/v0' },
    { providerId: 'unknown-provider' },
    { receiptEpoch: 'not-a-uuid' },
    { scope: {} },
    { guarantees: {} }
  ]) {
    await assert.rejects(discover(withFakeServer({ ...example(), ...bad })), /protocol|guarantees|scope/);
  }
});

test('a declared POST does not confer other methods or allow bypass via route prefix', async () => {
  const capability = await discover();
  assert.equal(plan(capability, { method: 'POST', path: '/api/tasks' }).method, 'POST');
  assert.throws(() => plan(capability, { method: 'PATCH', path: '/api/tasks' }), /authorized/);
  assert.throws(() => plan(capability, { path: '/api/tasksabc/task-7' }), /authorized/);
  assert.throws(() => plan(capability, { path: '/api/tasks/task-7/extra' }), /authorized/);
});

test('browser runtime origin must match the origin used for negotiation', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', {
      configurable: true, value: { origin: 'https://real-app.example.test' }
    });
    const server = withFakeServer();
    await assert.rejects(discover(server), /active page origin/);
    assert.equal(server.requests.length, 0);
    assert.throws(() => validateP5Capability(example(), {
      origin: ORIGIN, verifiedIdentity: IDENTITY, checkedAt: TIME
    }), /active page origin/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  }
});
