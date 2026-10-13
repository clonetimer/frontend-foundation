#!/usr/bin/env node
/**
 * Pattern Atlas candidate admission report. Never auto-promotes a release.
 * --offline: dependency-free regression gate, MUST remain Candidate.
 * --full (default): full workspace and isolated browser smokes, with JSON evidence.
 * Windows uses cmd.exe via the established, audited pnpm launcher.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planPnpmLaunch } from './dev-studio-launch.mjs';
import { summarizeAtlasGates } from './pattern-atlas-stable-policy.mjs';

const root = resolve(import.meta.dirname, '../..');
const cliArguments = process.argv.slice(2);
const offline = cliArguments.includes('--offline');
if (cliArguments.some((arg) => !['--offline', '--full'].includes(arg))) {
  console.error('用法: pnpm patterns:stable:check [--offline | --full]'); process.exit(2);
}
const mode = offline ? 'offline' : 'full';
const reportFile = join(root, 'artifacts', 'pattern-atlas', 'stable-gate-report.json');
const steps = [];
const sha256 = (name) => createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
function stamp() { return new Date().toISOString(); }
function pnpmVersion() {
  try {
    const launch = planPnpmLaunch(['--version']);
    return execFileSync(launch.command, launch.args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}
function gitRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return null; }
}
async function execute(label, command, args, { env, timeoutMs = 900000, stdio = 'inherit' } = {}) {
  console.log(`\n[Pattern Atlas Stable] ${label}`);
  const start = Date.now();
  return new Promise((done) => {
    let settled = false;
    let child;
    const finish = (code, detail) => {
      if (settled) return;
      settled = true;
      steps.push({ id: label, status: code === 0 ? 'passed' : 'failed', elapsedMs: Date.now() - start, exitCode: code, ...(detail ? { detail } : {}) });
      console.log(`[${code === 0 ? '通过' : '失败'}] ${label}`);
      done(code === 0);
    };
    try {
      child = spawn(command, args, { cwd: root, stdio, env: { ...process.env, ...env } });
      child.on('error', (error) => finish(1, error.message));
      child.on('exit', (code, signal) => finish(code === 0 ? 0 : 1, `exit=${code ?? 'null'}, signal=${signal ?? 'null'}`));
      const timer = setTimeout(() => { child.kill(); finish(1, `timeout=${timeoutMs}ms`); }, timeoutMs);
      child.on('close', () => clearTimeout(timer));
    } catch (error) { finish(1, error instanceof Error ? error.message : String(error)); }
  });
}
function pnpmCommand(args) { return planPnpmLaunch(args); }
async function nodeGate(label, script, args = []) { return execute(label, process.execPath, [script, ...args]); }
async function pnpmGate(label, args) { const launch = pnpmCommand(args); return execute(label, launch.command, launch.args); }
async function startShowcase(port) {
  const launch = pnpmCommand(['--filter', '@foundation/showcase', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort']);
  const child = spawn(launch.command, launch.args, { cwd: root, stdio: 'inherit', detached: process.platform !== 'win32', env: { ...process.env, BROWSER: 'none' } });
  let serverError; child.on('error', (error) => { serverError = error; });
  const url = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 45000) {
    if (serverError) throw serverError;
    if (child.exitCode !== null) throw new Error('Showcase 提前退出');
    try { if ((await fetch(`${url}/studio`)).ok) return { url, child }; } catch { /* still starting */ }
    await new Promise((done) => setTimeout(done, 350));
  }
  await stopShowcase(child);
  throw new Error('等待隔离 Showcase 开发服务器超时');
}
async function stopShowcase(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { child.kill(); }
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  }
}
const startedAt = stamp();
let finished = false;
async function gate(label, action) { if (!finished) finished = !(await action()); }
try {
  await gate('offline-verify', () => nodeGate('offline-verify', 'tooling/scripts/offline-verify.mjs'));
  await gate('atlas-sanity', () => nodeGate('atlas-sanity', 'tooling/scripts/pattern-atlas-sanity.mjs'));
  await gate('source-mirrors', async () => (await nodeGate('source-mirrors', 'tooling/scripts/sync-studio-workflow-export.mjs', ['--check'])) && (await nodeGate('widget-source-mirrors', 'tooling/scripts/sync-studio-widget-export.mjs', ['--check'])));
  await gate('workflow-runtime-test', () => execute('workflow-runtime-test', process.execPath, ['--experimental-strip-types', '--test', 'tooling/scripts/pattern-atlas-workflow-runtime.test.mjs']));
  await gate('gate-selftest', () => nodeGate('gate-selftest', '--test', ['tooling/scripts/pattern-atlas-stable-gate.test.mjs']));
  if (!offline) {
    await gate('frozen-install', () => pnpmGate('frozen-install', ['install', '--frozen-lockfile']));
    await gate('packages-build', () => pnpmGate('packages-build', ['build:packages']));
    await gate('workspace-typecheck', () => pnpmGate('workspace-typecheck', ['typecheck']));
    await gate('workspace-test', () => pnpmGate('workspace-test', ['test']));
    await gate('workspace-build', () => pnpmGate('workspace-build', ['-r', 'build']));
    await gate('workspace-lint', () => pnpmGate('workspace-lint', ['lint']));
    await gate('composition-compile', () => nodeGate('composition-compile', 'tooling/scripts/pattern-atlas-composition-check.mjs'));
    if (!finished) {
      let server;
      try {
        server = await startShowcase(5197);
        await gate('workflow-browser', () => execute('workflow-browser', process.execPath, ['tooling/scripts/pattern-atlas-workflow-browser-smoke.mjs'], { env: { STUDIO_SMOKE_URL: server.url } }));
        await gate('pilot-browser', () => execute('pilot-browser', process.execPath, ['tooling/scripts/pattern-atlas-pilot-browser-smoke.mjs'], { env: { PILOT_SMOKE_URL: server.url } }));
      } catch (error) {
        steps.push({ id: 'browser-server', status: 'failed', detail: error instanceof Error ? error.message : String(error) });
        finished = true;
      } finally { await stopShowcase(server?.child); }
    }
  }
} catch (error) { steps.push({ id: 'gate-internal', status: 'failed', detail: error instanceof Error ? error.message : String(error) }); }
const decision = summarizeAtlasGates(mode, steps);
const report = {
  schemaVersion: 1, project: 'Pattern Atlas Studio', phase: 16,
  mode, startedAt, finishedAt: stamp(), platform: process.platform,
  node: process.version, pnpmActual: pnpmVersion(), pnpmExpected: '11.7.0',
  lockfileSha256: sha256('pnpm-lock.yaml'),
  workflowRuntimeSha256: sha256('apps/showcase/src/modules/pattern-atlas/studio/studio-workflows.ts'),
  revision: gitRevision(), decision, steps,
  notice: 'Local report only. Foundation registry release and external Stable promotion are separate procedures.'
};
mkdirSync(join(root, 'artifacts', 'pattern-atlas'), { recursive: true });
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(`\n验收状态：${decision.status}；报告：${reportFile}`);
if (decision.status === 'blocked' || decision.status === 'incomplete') process.exitCode = 1;
