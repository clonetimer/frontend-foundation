import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
test('missing standalone export browser prevents Stable admission', () => {
  const entries = REQUIRED_LOCAL_GATES.filter((id) => id !== 'standalone-export-browser').map((id) => ({ id, status: 'passed' }));
  const result = summarizeAtlasGates('full', entries);
  assert.equal(result.status, 'incomplete');
  assert(result.missing.includes('standalone-export-browser'));
});
test('even full local green is not automatically promoted', () => {
  const result = summarizeAtlasGates('full', REQUIRED_LOCAL_GATES.map((id) => ({ id, status: 'passed' })));
  assert.equal(result.status, 'local-gates-passed'); assert.equal(result.promotionAllowed, false);
});

// Studio's release gates must never silently skip changes to Record Provider,
// export runtime, the component catalog, or a merged main commit.
test('Studio admission workflow covers all Studio changes and merged main', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/pattern-atlas-stable.yml', import.meta.url), 'utf8');
  assert.match(yaml, /pull_request:\s*\n\s+paths:/);
  assert.match(yaml, /push:\s*\n\s+branches: \[main\]\s*\n\s+paths:/);
  assert.equal((yaml.match(/'apps\/showcase\/src\/modules\/pattern-atlas\/\*\*'/g) ?? []).length, 2);
  assert.equal((yaml.match(/'tooling\/scripts\/pattern-atlas-\*'/g) ?? []).length, 2);
  assert.equal((yaml.match(/'pnpm-lock.yaml'/g) ?? []).length, 2);
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /Full admission \(no automatic Stable promotion\)/);
});

test('Studio candidate report identifies Studio independently from frozen Foundation', () => {
  const source = readFileSync(new URL('./pattern-atlas-stable-gate.mjs', import.meta.url), 'utf8');
  assert.match(source, /releaseTrack: 'pattern-atlas-studio'/);
  assert.match(source, /foundationContract: '0.21.0-frozen'/);
  assert.match(source, /phase: 22/);
  assert.doesNotMatch(source, /phase: 16/);
});
