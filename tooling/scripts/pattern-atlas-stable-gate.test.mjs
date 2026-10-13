import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_LOCAL_GATES, summarizeAtlasGates } from './pattern-atlas-stable-policy.mjs';
test('offline success never awards Stable', () => {
  assert.deepEqual(summarizeAtlasGates('offline', [{ id: 'offline-verify', status: 'passed' }]).status, 'candidate-offline-only');
});
test('typecheck failure blocks promotion even when tests pass', () => {
  const result = summarizeAtlasGates('full', [{ id: 'workspace-test', status: 'passed' }, { id: 'workspace-typecheck', status: 'failed' }]);
  assert.equal(result.status, 'blocked'); assert.equal(result.promotionAllowed, false);
});
test('missing browser smoke is not treated as success', () => {
  const entries = REQUIRED_LOCAL_GATES.filter((id) => id !== 'workflow-browser').map((id) => ({ id, status: 'passed' }));
  assert.equal(summarizeAtlasGates('full', entries).status, 'incomplete');
});
test('even full local green is not automatically promoted', () => {
  const result = summarizeAtlasGates('full', REQUIRED_LOCAL_GATES.map((id) => ({ id, status: 'passed' })));
  assert.equal(result.status, 'local-gates-passed'); assert.equal(result.promotionAllowed, false);
});
