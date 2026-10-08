import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../preflight.mjs';
import { createReleasePlan } from '../plan.mjs';
import { setWorkspaceVersion } from '../version.mjs';
import { verifyPublicApiSnapshot } from '../public-api.mjs';
import { parseArgs as parsePublishArgs, verifyArtifactFile } from '../publish.mjs';
import { parseArgs as parsePromoteArgs, createPromotionCommands } from '../promote.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const currentVersion = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8')).version;

// These tests are repository-contract tests; they deliberately avoid network access.
test('release preflight passes repository metadata', () => {
  const result = runPreflight();
  assert.deepEqual(result.errors, []);
  assert.ok(result.publishable.includes('@foundation/create-app'));
});

test('release plan places internal dependencies before dependants', () => {
  const plan = createReleasePlan();
  const index = new Map(plan.publishOrder.map((item, i) => [item.name, i]));
  assert.ok(index.get('@foundation/core') < index.get('@foundation/api'));
  assert.ok(index.get('@foundation/api') < index.get('@foundation/app'));
  assert.ok(index.get('@foundation/app') < index.get('@foundation/testing'));
  assert.equal(plan.publishOrder.at(-1).name, '@foundation/create-app');
});

test('version tool rejects invalid versions before modifying manifests', () => {
  assert.throws(() => setWorkspaceVersion('latest'), /Invalid version/);
});

test('public API snapshot matches current package exports', () => {
  assert.deepEqual(verifyPublicApiSnapshot().errors, []);
});


test('artifact integrity verifier accepts exact bytes and rejects tampering', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foundation-artifact-'));
  const path = join(dir, 'pkg.tgz');
  const bytes = Buffer.from('verified artifact');
  writeFileSync(path, bytes);
  const expected = {
    file: 'pkg.tgz',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
  assert.deepEqual(verifyArtifactFile({ name: '@foundation/test', path, file: 'pkg.tgz', expected }), {
    sizeBytes: bytes.length,
    sha256: expected.sha256
  });
  writeFileSync(path, Buffer.from('tampered artifact'));
  assert.throws(() => verifyArtifactFile({ name: '@foundation/test', path, file: 'pkg.tgz', expected }), /Artifact (size|SHA-256) mismatch/);
});


test("publish CLI accepts pnpm's -- separator", () => {
  assert.deepEqual(parsePublishArgs(['--', '--tag', 'candidate']), { execute: false, tag: 'candidate' });
  assert.deepEqual(parsePublishArgs(['--', '--registry', 'https://registry.example/', '--tag', 'next', '--execute']), {
    execute: true,
    tag: 'next',
    registry: 'https://registry.example/'
  });
});


test("promote CLI accepts pnpm's -- separator", () => {
  assert.deepEqual(parsePromoteArgs(['--', '--tag', 'latest']), { execute: false, tag: 'latest' });
  assert.deepEqual(parsePromoteArgs(['--', '--registry', 'https://registry.example/', '--tag', 'stable', '--execute']), {
    execute: true,
    tag: 'stable',
    registry: 'https://registry.example/'
  });
});

test('promotion uses dist-tag instead of republishing tarballs', () => {
  const commands = createPromotionCommands({ registry: 'https://registry.example/', tag: 'latest' });
  assert.ok(commands.length > 0);
  assert.ok(commands.every((command) => command.args[0] === 'dist-tag' && command.args[1] === 'add'));
  assert.ok(commands.every((command) => command.args[2].endsWith(`@${currentVersion}`)));
});
