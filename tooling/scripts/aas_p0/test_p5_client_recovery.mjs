import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P5_PENDING_KEY, readSyntheticPending, beginSyntheticStatusPatch,
  recoverSyntheticStatusPatch
} from './p5_client_recovery.mjs';

const ORIGIN = 'http://127.0.0.1:8765';
const TOKEN = 'sandbox-writer-only-in-memory-' + 'x'.repeat(32);
const ETAG = '"' + 'a'.repeat(64) + '"';
const KEY = 'p5_native_browser_contract_001';

function storage() {
  const rows = new Map();
  return {
    getItem: (key) => rows.has(key) ? rows.get(key) : null,
    setItem: (key, value) => { rows.set(key, value); },
    removeItem: (key) => { rows.delete(key); }
  };
}
function reply(status, data, etag = ETAG) {
  return { status, headers: { get: (key) => key.toLowerCase() === 'etag' ? etag : null },
    text: async () => JSON.stringify(data) };
}
function fixtureServer({ firstPatch = 503, receipt = 404, experiment = 'p0_case_1' } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === ORIGIN + '/api/records/1' && options.method === 'GET') {
      return reply(200, { data: { id: 1, experiment_id: experiment, status: 'draft' } });
    }
    if (url === ORIGIN + '/api/records/1' && options.method === 'PATCH') {
      return reply(firstPatch, { data: { id: 1, status: 'evaluated' } });
    }
    if (url === ORIGIN + '/api/mutations/' + KEY) {
      return receipt === 200
        ? reply(200, { status: 'committed', recordId: 1, response: { data: { id: 1, status: 'evaluated' } } })
        : reply(receipt, { status: 'not_found' });
    }
    throw new Error('Unexpected URL ' + url);
  };
  return { calls, fetchImpl };
}
const start = (store, fetchImpl) => beginSyntheticStatusPatch({
  origin: ORIGIN, recordId: 1, status: 'evaluated', writerToken: TOKEN,
  storage: store, fetchImpl, newKey: () => KEY
});

test('a commit-then-503 is journaled; receipt after new client session resolves without second PATCH', async () => {
  const store = storage(), server = fixtureServer({ firstPatch: 503, receipt: 200 });
  assert.equal((await start(store, server.fetchImpl)).state, 'pending');
  assert.equal(readSyntheticPending(store).key, KEY);
  assert.equal((await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: server.fetchImpl
  })).state, 'committed');
  assert.equal(readSyntheticPending(store), null);
  assert.equal(server.calls.filter((c) => c.options.method === 'PATCH').length, 1);
});

test('HTTP 404 receipt does not silently replay, discard journal, or claim not committed', async () => {
  const store = storage(), server = fixtureServer();
  await start(store, server.fetchImpl);
  const pending = await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: server.fetchImpl
  });
  assert.deepEqual({ state: pending.state, reason: pending.reason },
    { state: 'pending', reason: 'receipt-not-found-no-replay' });
  assert.equal(server.calls.filter((c) => c.options.method === 'PATCH').length, 1);
  assert.equal(readSyntheticPending(store).key, KEY);
});

test('explicit replay uses identical request bytes, original key and original ETag', async () => {
  const store = storage(), server = fixtureServer({ firstPatch: 503, receipt: 404 });
  await start(store, server.fetchImpl);
  const initial = server.calls.find((c) => c.options.method === 'PATCH').options;
  const recovered = fixtureServer({ firstPatch: 200, receipt: 404 });
  assert.equal((await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: recovered.fetchImpl, replayIfMissing: true
  })).state, 'committed');
  const replay = recovered.calls.find((c) => c.options.method === 'PATCH').options;
  assert.deepEqual(replay, initial);
  assert.equal(readSyntheticPending(store), null);
});

test('conflict, stale ETag and missing writer role cannot generate a new key', async () => {
  const store = storage(), server = fixtureServer({ firstPatch: 412 });
  assert.equal((await start(store, server.fetchImpl)).reason, 'http-412');
  await assert.rejects(start(store, server.fetchImpl), /previous P5 mutation/);
  const unresolved = await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: fixtureServer({ receipt: 403 }).fetchImpl
  });
  assert.equal(unresolved.reason, 'receipt-http-403');
  assert.equal(readSyntheticPending(store).key, KEY);
  await assert.rejects(recoverSyntheticStatusPatch({ writerToken: '', storage: store,
    fetchImpl: server.fetchImpl }), /writer token/);
});

test('only loopback, status-only, native synthetic records with strong ETag may start', async () => {
  const store = storage(), server = fixtureServer({ experiment: 'real_customer_model' });
  await assert.rejects(start(store, server.fetchImpl), /Non-synthetic/);
  assert.equal(readSyntheticPending(store), null);
  const weak = async (url, options) => {
    const response = await fixtureServer().fetchImpl(url, options);
    response.headers.get = () => 'W/"a"';
    return response;
  };
  await assert.rejects(start(store, weak), /Strong native ETag/);
  await assert.rejects(beginSyntheticStatusPatch({
    origin: 'https://remote.example', recordId: 1, status: 'evaluated',
    writerToken: TOKEN, storage: store, fetchImpl: server.fetchImpl
  }), /loopback/);
  await assert.rejects(beginSyntheticStatusPatch({
    origin: ORIGIN, recordId: 1, status: 'arbitrary', writerToken: TOKEN,
    storage: store, fetchImpl: server.fetchImpl
  }), /status changes/);
  assert.equal(readSyntheticPending(store), null);
});

test('storage errors fail closed before PATCH, without attempting an unsafe mutation', async () => {
  const store = storage(), server = fixtureServer();
  store.setItem = () => { throw new Error('quota denied'); };
  await assert.rejects(start(store, server.fetchImpl), /quota denied/);
  assert.equal(server.calls.filter((c) => c.options.method === 'PATCH').length, 0);
});

test('corrupt or oversized pending journal blocks recovery and every new write', async () => {
  const store = storage(), server = fixtureServer();
  store.setItem(P5_PENDING_KEY, '{"version":1,"key":"bad"}');
  assert.throws(() => readSyntheticPending(store), /malformed/);
  await assert.rejects(start(store, server.fetchImpl), /malformed/);
  await assert.rejects(recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: server.fetchImpl
  }), /malformed/);
  assert.equal(server.calls.length, 0);
});

test('journal contains no bearer token or arbitrary business fields', async () => {
  const store = storage(), server = fixtureServer();
  await start(store, server.fetchImpl);
  const raw = store.getItem(P5_PENDING_KEY);
  assert.equal(raw.includes(TOKEN), false);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),
    ['version', 'origin', 'recordId', 'status', 'key', 'etag', 'body'].sort());
  assert.equal(JSON.parse(raw).body, '{"status":"evaluated"}');
});

test('forged committed receipt cannot clear the original recovery record', async () => {
  const store = storage(), server = fixtureServer();
  await start(store, server.fetchImpl);
  const fake = async () => reply(200, {
    status: 'committed', recordId: 2,
    response: { data: { id: 2, status: 'evaluated' } }
  });
  const outcome = await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: fake
  });
  assert.equal(outcome.reason, 'unverified-receipt');
  assert.equal(readSyntheticPending(store).key, KEY);
});

test('network disconnection preserves the journal with no automatic resend', async () => {
  const store = storage();
  let calls = 0;
  const transport = async (url, options) => {
    if (options.method === 'GET' && url.endsWith('/api/records/1')) {
      return reply(200, { data: { id: 1, experiment_id: 'p0_case_1' } });
    }
    calls++;
    throw new Error('offline');
  };
  assert.equal((await start(store, transport)).reason, 'transport-unknown');
  assert.equal((await recoverSyntheticStatusPatch({
    writerToken: TOKEN, storage: store, fetchImpl: transport
  })).reason, 'receipt-query-unavailable');
  assert.equal(calls, 2);
  assert.equal(readSyntheticPending(store).key, KEY);
});
