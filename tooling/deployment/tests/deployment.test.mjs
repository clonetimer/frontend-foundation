import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyDeploymentTarget } from '../verify.mjs';

test('nginx deployment target preserves SPA/runtime/proxy invariants', () => {
  const result = verifyDeploymentTarget();
  assert.deepEqual(result.errors, []);
});


test('portable deployment verification checks generated entrypoint without depending on POSIX sh', () => {
  const result = verifyDeploymentTarget({ forcePortable: true });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes('Linux CI performs real shell execution')));
});
