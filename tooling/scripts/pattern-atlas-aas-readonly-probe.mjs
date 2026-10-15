#!/usr/bin/env node
/** Local-only, read-only contract probe for the user's AAS Python backend.
 * Does NOT import, install plugins, delete, upload files, or mutate databases.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

async function probe(base) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Only loopback HTTP targets are allowed');
  async function read(path, status) {
    const res = await fetch(new URL(path, url), { redirect: 'error', signal: globalThis.AbortSignal.timeout(10000) });
    assert.equal(res.status, status, path + ' status');
    assert.match(res.headers.get('content-type') || '', /application\/json/, path + ' content type');
    return res.json();
  }
  const databases = await read('/api/databases', 200);
  assert(Array.isArray(databases.items), 'AAS /api/databases items[]');
  const catalog = await read('/api/available-algorithms', 200);
  assert(Array.isArray(catalog.algorithms), 'AAS detector catalog algorithms[]');
  const models = await read('/api/models?limit=5', 200);
  assert(Array.isArray(models.models) && Number.isInteger(models.total), 'AAS models[]/total');
  const invalid = await read('/api/models?limit=0', 400);
  assert(typeof invalid.error === 'string', 'AAS invalid limit JSON error');
  const missing = await read('/api/__studio_p0_missing', 404);
  assert(typeof missing.error === 'string', 'AAS missing route JSON error');
  return { status: 'READ_ONLY_PASS', checks: 5, modelCount: models.models.length,
    limitation: 'Not a write, access-control, Studio UI or production authorization acceptance' };
}

async function selftest() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const isBad = url.pathname.includes('missing') || url.searchParams.get('limit') === '0';
    const payload = isBad ? { error: 'test' } :
      url.pathname === '/api/databases' ? { items: [] } :
      url.pathname === '/api/available-algorithms' ? { algorithms: [] } : { models: [], total: 0 };
    res.writeHead(isBad ? url.pathname.includes('missing') ? 404 : 400 : 200,
      { 'content-type': 'application/json' }); res.end(JSON.stringify(payload));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    assert.equal((await probe('http://127.0.0.1:' + server.address().port + '/')).status, 'READ_ONLY_PASS');
    await assert.rejects(probe('https://external.example/'), /Only loopback/);
    console.log(JSON.stringify({ status: 'SELFTEST_PASS' }));
  } finally { await new Promise(done => server.close(done)); }
}

try {
  if (process.argv[2] === '--selftest') await selftest();
  else if (process.argv[2] === '--base' && process.argv[3])
    console.log(JSON.stringify(await probe(process.argv[3]), null, 2));
  else throw new Error('Use --selftest or --base http://127.0.0.1:8765/');
} catch (error) { console.error(error); process.exitCode = 1; }
