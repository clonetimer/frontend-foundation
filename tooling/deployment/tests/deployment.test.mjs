import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyDeploymentTarget } from '../verify.mjs';

test('nginx deployment target preserves SPA/runtime/proxy invariants', () => {
  const result = verifyDeploymentTarget();
  assert.deepEqual(result.errors, []);
});
