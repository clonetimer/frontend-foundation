import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { planPnpmLaunch } from './dev-studio-launch.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('Windows: prefers JS pnpm entrypoint and does not launch pnpm.cmd directly', () => {
  assert.deepEqual(planPnpmLaunch(['build:packages'], {
    platform: 'win32', nodeExecutable: 'C:\\node\\node.exe',
    npmExecPath: 'C:\\Program Files\\pnpm\\pnpm.cjs', fileExists: () => true
  }), {
    command: 'C:\\node\\node.exe', args: ['C:\\Program Files\\pnpm\\pnpm.cjs', 'build:packages']
  });
});

test('Windows: falls back to explicit cmd.exe with a complete command', () => {
  assert.deepEqual(planPnpmLaunch(['--filter', '@foundation/designer', 'dev', '--port', '5174', '--strictPort'], {
    platform: 'win32', npmExecPath: undefined, comSpec: 'C:\\Windows\\System32\\cmd.exe'
  }), {
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', 'pnpm --filter @foundation/designer dev --port 5174 --strictPort']
  });
});

test('Windows: rejects unsafe shell arguments', () => {
  assert.throws(() => planPnpmLaunch(['build:packages & echo unsafe'], {
    platform: 'win32', npmExecPath: undefined
  }), /Unsafe pnpm argument/);
});

test('Linux/macOS: invokes pnpm without a shell when no JS entrypoint is present', () => {
  assert.deepEqual(planPnpmLaunch(['build:packages'], { platform: 'linux', npmExecPath: undefined }), {
    command: 'pnpm', args: ['build:packages']
  });
});

test('dev:studio builds packages and starts both servers with a mock pnpm CLI', () => {
  const folder = mkdtempSync(join(tmpdir(), 'foundation-studio-'));
  const fixture = join(folder, 'mock-pnpm.mjs');
  const log = join(folder, 'calls.ndjson');
  try {
    writeFileSync(fixture, `import {appendFileSync} from 'node:fs';\nappendFileSync(process.env.MOCK_PNPM_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\nif (process.argv[2] !== 'build:packages') await new Promise((resolve) => setTimeout(resolve, 200));\n`);
    const result = spawnSync(process.execPath, [resolve(root, 'tooling/scripts/dev-studio.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 12000,
      env: { ...process.env, npm_execpath: fixture, MOCK_PNPM_LOG: log }
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], ['build:packages']);
    const services = calls.slice(1).sort((a, b) => a[1].localeCompare(b[1]));
    assert.deepEqual(services, [
      ['--filter', '@foundation/designer', 'dev', '--port', '5174', '--strictPort'],
      ['--filter', '@foundation/showcase', 'dev', '--port', '5173', '--strictPort']
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
