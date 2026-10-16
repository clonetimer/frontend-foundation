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

/**
 * Windows does not ship /bin/sh. Inspect the *generated* POSIX entrypoint and
 * render its config here, while CI on Linux still executes the real script.
 * A portable check is not evidence that the container entrypoint ran.
 */
function portableRuntimeChecks(scriptText, staticConf, proxyTemplate, errors) {
  const invariants = [
    ['POSIX entrypoint', /^#!\/bin\/sh\s*$/m],
    ['fail-fast shell mode', /^set -eu\s*$/m],
    ['single-line input guard', /APP_ENVIRONMENT and API_BASE_URL must be single-line values/],
    ['JSON escaping', /json_escape\(\)/],
    ['runtime JSON template', /cat > "\$WEB_ROOT\/runtime-config\.json" <<EOF_JSON/],
    ['explicit upstream mode', /if \[ -n "\$API_UPSTREAM" \]; then/],
    ['upstream requires /api', /if \[ "\$API_BASE_URL" != "\/api" \]; then/],
    ['proxy substitution', /envsubst '\$\{API_UPSTREAM\}'/],
    ['proxy template input', /"\$TEMPLATE_DIR\/default\.proxy\.conf\.template"/],
    ['relative URL rejection', /Relative API_BASE_URL=\$API_BASE_URL requires API_UPSTREAM/],
    ['static configuration copy', /cp "\$TEMPLATE_DIR\/default\.static\.conf" "\$NGINX_CONF"/]
  ];
  for (const [label, pattern] of invariants) {
    if (!pattern.test(scriptText)) errors.push(`generated nginx runtime script missing ${label}`);
  }
  const nameAssignment = scriptText.match(/^APP_NAME_JSON=('(?:[^']|'\\'')*')\s*$/m)?.[1];
  if (!nameAssignment) {
    errors.push('generated nginx runtime script has an invalid app name assignment');
    return;
  }
  let name;
  try {
    name = JSON.parse(nameAssignment.slice(1, -1).replaceAll("'\\''", "'"));
  } catch {
    errors.push('generated nginx runtime script has invalid JSON app name');
    return;
  }
  const runtimeTemplate = scriptText.match(/cat > "\$WEB_ROOT\/runtime-config\.json" <<EOF_JSON\r?\n([\s\S]*?)\r?\nEOF_JSON/)?.[1];
  if (!runtimeTemplate) {
    errors.push('generated nginx runtime-config JSON heredoc missing');
    return;
  }
  const runtimeJSON = (baseUrl) => runtimeTemplate
    .replaceAll('${APP_NAME_JSON}', JSON.stringify(name))
    .replaceAll('${APP_ENVIRONMENT_JSON}', 'production')
    .replaceAll('${API_BASE_URL_JSON}', baseUrl);
  for (const baseUrl of ['https://api.example.test', '/api']) {
    try {
      const output = JSON.parse(runtimeJSON(baseUrl));
      if (output.api?.baseUrl !== baseUrl) errors.push(`portable nginx runtime-config baseUrl mismatch for ${baseUrl}`);
      if (output.app?.name !== "Cost $API_BASE_URL 'Q'") errors.push('portable nginx runtime-config mangled generated app name');
      if (output.app?.environment !== 'production') errors.push('portable nginx runtime-config changed environment');
      if (output.router?.mode !== 'browser') errors.push('portable nginx runtime-config changed router mode');
    } catch (error) {
      errors.push(`portable nginx runtime-config could not parse ${baseUrl}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!staticConf.includes('try_files $uri $uri/ /index.html')) errors.push('portable nginx static mode lost SPA fallback');
  const upstream = 'http://backend:8080';
  const rendered = proxyTemplate.replaceAll('${API_UPSTREAM}', upstream);
  if (!rendered.includes(`proxy_pass ${upstream};`) || rendered.includes('${API_UPSTREAM}')) {
    errors.push('portable nginx proxy config failed upstream substitution');
  }
  if (proxyTemplate.split('${API_UPSTREAM}').length !== 2) {
    errors.push('portable nginx proxy template must contain exactly one API_UPSTREAM placeholder');
  }
}

function detectShell() {
  const probe = spawnSync('sh', ['-c', 'exit 0'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') return false;
  if (probe.error || probe.status !== 0) {
    throw new Error(`POSIX sh probe failed: ${probe.error?.message ?? probe.stderr ?? probe.status}`);
  }
  return true;
}

export function verifyDeploymentTarget({ forcePortable = false } = {}) {
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

      if (forcePortable || process.platform === 'win32' || !detectShell()) {
        portableRuntimeChecks(readFileSync(script, 'utf8'), staticConf, proxyTemplate, errors);
        warnings.push('Portable host validation: generated nginx entrypoint verified structurally (POSIX shell not executed here); Linux CI performs real shell execution');
      } else {
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

      }

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
