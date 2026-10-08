#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../create-app/index.mjs';

const required = [
  '.dockerignore',
  'deploy/nginx/Dockerfile',
  'deploy/nginx/default.static.conf',
  'deploy/nginx/default.proxy.conf.template',
  'deploy/nginx/40-foundation-runtime.sh',
  'deploy/nginx/README.md'
];

function semverTuple(text) {
  const match = text.match(/nginx\/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : undefined;
}

function atLeast(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

function testNginxConfig(serverText) {
  const version = spawnSync('nginx', ['-v'], { encoding: 'utf8' });
  if (version.error) return { skipped: true, reason: 'nginx binary not installed' };
  const tuple = semverTuple(`${version.stdout}${version.stderr}`);
  if (!tuple || !atLeast(tuple, [1, 20, 0])) return { skipped: true, reason: 'nginx version could not be validated' };

  const temp = mkdtempSync(join(tmpdir(), 'foundation-nginx-test-'));
  try {
    const conf = join(temp, 'nginx.conf');
    writeFileSync(conf, `worker_processes 1;\npid ${join(temp, 'nginx.pid')};\nevents { worker_connections 16; }\nhttp {\n  include /etc/nginx/mime.types;\n  access_log off;\n${serverText}\n}\n`);
    const result = spawnSync('nginx', ['-t', '-p', `${temp}/`, '-c', conf], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`nginx -t failed:\n${result.stderr || result.stdout}`);
    return { skipped: false };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function verifyDeploymentTarget() {
  const errors = [];
  const warnings = [];
  const temp = mkdtempSync(join(tmpdir(), 'foundation-deployment-'));
  try {
    const target = join(temp, 'app');
    createApp([target, '--name', 'deployment-smoke', '--app-id', 'deployment.smoke', '--title', 'Cost $API_BASE_URL \'Q\'', '--deployment', 'nginx']);
    for (const file of required) if (!existsSync(join(target, file))) errors.push(`generated nginx deployment missing ${file}`);

    if (!errors.length) {
      const staticConf = readFileSync(join(target, 'deploy/nginx/default.static.conf'), 'utf8');
      for (const token of ['try_files $uri $uri/ /index.html', 'location = /runtime-config.json', 'immutable', 'location = /healthz', 'gzip on']) {
        if (!staticConf.includes(token)) errors.push(`static nginx config missing invariant: ${token}`);
      }
      const proxyTemplate = readFileSync(join(target, 'deploy/nginx/default.proxy.conf.template'), 'utf8');
      for (const token of ['location /api/', 'proxy_pass ${API_UPSTREAM}', 'X-Forwarded-For']) {
        if (!proxyTemplate.includes(token)) errors.push(`proxy nginx template missing invariant: ${token}`);
      }

      const envRoot = join(temp, 'env');
      const webRoot = join(envRoot, 'web');
      const confOut = join(envRoot, 'default.conf');
      const script = join(target, 'deploy/nginx/40-foundation-runtime.sh');
      const templateDir = join(target, 'deploy/nginx');
      const common = {
        FOUNDATION_TEMPLATE_DIR: templateDir,
        FOUNDATION_WEB_ROOT: webRoot,
        FOUNDATION_NGINX_CONF: confOut,
        APP_ENVIRONMENT: 'production'
      };

      execFileSync('sh', [script], {
        env: { ...process.env, ...common, API_BASE_URL: 'https://api.example.test' },
        stdio: 'pipe'
      });
      const runtime = JSON.parse(readFileSync(join(webRoot, 'runtime-config.json'), 'utf8'));
      if (runtime.api.baseUrl !== 'https://api.example.test') errors.push('runtime config injection did not preserve absolute API URL');
      if (runtime.app.name !== "Cost $API_BASE_URL 'Q'") errors.push('runtime config injection modified the generated application name');
      if (readFileSync(confOut, 'utf8') !== staticConf) errors.push('static API mode did not select static nginx config');

      execFileSync('sh', [script], {
        env: { ...process.env, ...common, API_BASE_URL: '/api', API_UPSTREAM: 'http://backend:8080' },
        stdio: 'pipe'
      });
      const proxyConf = readFileSync(confOut, 'utf8');
      if (!proxyConf.includes('proxy_pass http://backend:8080;')) errors.push('proxy mode did not render API_UPSTREAM');

      const invalid = spawnSync('sh', [script], {
        env: { ...process.env, ...common, API_BASE_URL: '/api', API_UPSTREAM: '' },
        encoding: 'utf8'
      });
      if (invalid.status === 0) errors.push('relative API_BASE_URL without API_UPSTREAM must fail fast');

      try {
        const result = testNginxConfig(staticConf);
        if (result.skipped) warnings.push(result.reason);
        const rendered = proxyTemplate.replaceAll('${API_UPSTREAM}', 'http://127.0.0.1:8081');
        const proxyResult = testNginxConfig(rendered);
        if (proxyResult.skipped && !warnings.includes(proxyResult.reason)) warnings.push(proxyResult.reason);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return { errors, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = verifyDeploymentTarget();
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Deployment checks passed');
  }
}
