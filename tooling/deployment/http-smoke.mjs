#!/usr/bin/env node
import { createServer } from 'node:http';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createApp } from '../create-app/index.mjs';

function fail(message) {
  throw new Error(message);
}

async function getFreePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitFor(url, timeoutMs = 5000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return response;
      last = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolveWait) => globalThis.setTimeout(resolveWait, 80));
  }
  throw last ?? new Error(`Timed out waiting for ${url}`);
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) fail(`${label} missing ${expected}`);
}

function prepareServerConf(serverBlock, { rootDir, port }) {
  return serverBlock
    .replace('listen 8080 default_server;', `listen ${port} default_server;`)
    .replace('root /usr/share/nginx/html;', `root ${rootDir};`);
}

function startNginx(temp, serverBlock) {
  mkdirSync(temp, { recursive: true });
  const conf = join(temp, 'nginx.conf');
  const pid = join(temp, 'nginx.pid');
  const errorLog = join(temp, 'error.log');
  writeFileSync(conf, [
    'worker_processes 1;',
    `pid ${pid};`,
    `error_log ${errorLog} notice;`,
    'events { worker_connections 64; }',
    'http {',
    '  include /etc/nginx/mime.types;',
    '  access_log off;',
    serverBlock,
    '}',
    ''
  ].join('\n'));
  const test = spawnSync('nginx', ['-t', '-c', conf], { encoding: 'utf8' });
  if (test.error) throw test.error;
  if (test.status !== 0) fail(`nginx -t failed:\n${test.stderr || test.stdout}`);
  const child = spawn('nginx', ['-c', conf, '-g', 'daemon off;'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  return { child, stderr: () => stderr };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveStop) => child.once('exit', resolveStop)),
    new Promise((resolveStop) => globalThis.setTimeout(resolveStop, 1500))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function runStaticSmoke(appRoot, temp) {
  const port = await getFreePort();
  const webRoot = join(temp, 'static-web');
  const confOut = join(temp, 'static-server.conf');
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><html><body>foundation-smoke</body></html>');
  writeFileSync(join(webRoot, 'assets', 'app-123.js'), 'console.log("asset")');

  const script = join(appRoot, 'deploy/nginx/40-foundation-runtime.sh');
  execFileSync('sh', [script], {
    env: {
      ...process.env,
      FOUNDATION_TEMPLATE_DIR: join(appRoot, 'deploy/nginx'),
      FOUNDATION_WEB_ROOT: webRoot,
      FOUNDATION_NGINX_CONF: confOut,
      APP_ENVIRONMENT: 'production',
      API_BASE_URL: 'https://api.example.test'
    },
    stdio: 'pipe'
  });

  const serverBlock = prepareServerConf(readFileSync(confOut, 'utf8'), { rootDir: webRoot, port });
  const nginx = startNginx(join(temp, 'static-nginx'), serverBlock);
  try {
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const health = await globalThis.fetch(`http://127.0.0.1:${port}/healthz`);
    if ((await health.text()).trim() !== 'ok') fail('healthz body mismatch');

    const fallback = await globalThis.fetch(`http://127.0.0.1:${port}/route/that/does/not/exist`);
    assertIncludes(await fallback.text(), 'foundation-smoke', 'SPA fallback');

    const runtime = await globalThis.fetch(`http://127.0.0.1:${port}/runtime-config.json`);
    const runtimeJson = await runtime.json();
    if (runtimeJson.api?.baseUrl !== 'https://api.example.test') fail('runtime-config API base URL mismatch');
    assertIncludes(runtime.headers.get('cache-control') ?? '', 'no-store', 'runtime-config cache control');

    const asset = await globalThis.fetch(`http://127.0.0.1:${port}/assets/app-123.js`);
    assertIncludes(asset.headers.get('cache-control') ?? '', 'immutable', 'asset cache control');
  } finally {
    await stopChild(nginx.child);
  }
}

async function runProxySmoke(appRoot, temp) {
  const upstream = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(`upstream:${request.url}`);
  });
  await new Promise((resolveListen, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolveListen);
  });
  const upstreamAddress = upstream.address();
  const upstreamPort = typeof upstreamAddress === 'object' && upstreamAddress ? upstreamAddress.port : undefined;
  const port = await getFreePort();
  const webRoot = join(temp, 'proxy-web');
  const confOut = join(temp, 'proxy-server.conf');
  mkdirSync(webRoot, { recursive: true });
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><html><body>proxy-smoke</body></html>');

  const script = join(appRoot, 'deploy/nginx/40-foundation-runtime.sh');
  execFileSync('sh', [script], {
    env: {
      ...process.env,
      FOUNDATION_TEMPLATE_DIR: join(appRoot, 'deploy/nginx'),
      FOUNDATION_WEB_ROOT: webRoot,
      FOUNDATION_NGINX_CONF: confOut,
      APP_ENVIRONMENT: 'production',
      API_BASE_URL: '/api',
      API_UPSTREAM: `http://127.0.0.1:${upstreamPort}`
    },
    stdio: 'pipe'
  });

  const serverBlock = prepareServerConf(readFileSync(confOut, 'utf8'), { rootDir: webRoot, port });
  const nginx = startNginx(join(temp, 'proxy-nginx'), serverBlock);
  try {
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const response = await globalThis.fetch(`http://127.0.0.1:${port}/api/ping`);
    const text = await response.text();
    if (text !== 'upstream:/api/ping') fail(`proxy response mismatch: ${text}`);
  } finally {
    await stopChild(nginx.child);
    await new Promise((resolveClose) => upstream.close(resolveClose));
  }
}

export async function runNginxHttpSmoke() {
  const version = spawnSync('nginx', ['-v'], { encoding: 'utf8' });
  if (version.error) fail('nginx binary is required for deploy:smoke');
  const temp = mkdtempSync(join(tmpdir(), 'foundation-nginx-http-smoke-'));
  chmodSync(temp, 0o755);
  try {
    const appRoot = join(temp, 'app');
    createApp([appRoot, '--name', 'nginx-http-smoke', '--app-id', 'nginx.http.smoke', '--title', 'Nginx HTTP Smoke', '--deployment', 'nginx']);
    await runStaticSmoke(appRoot, temp);
    await runProxySmoke(appRoot, temp);
    return { nginx: `${version.stdout}${version.stderr}`.trim() };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runNginxHttpSmoke()
    .then((result) => console.log(`Nginx HTTP smoke passed (${result.nginx})`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
