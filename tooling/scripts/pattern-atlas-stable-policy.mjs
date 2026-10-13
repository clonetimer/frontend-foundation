/** Pure decision policy. A local gate passing is not an externally promoted Stable release. */
export const REQUIRED_LOCAL_GATES = Object.freeze([
  'offline-verify', 'atlas-sanity', 'source-mirrors', 'workflow-runtime-test', 'gate-selftest', 'frozen-install', 'packages-build',
  'workspace-typecheck', 'workspace-test', 'workspace-build', 'workspace-lint',
  'composition-compile', 'workflow-browser', 'pilot-browser'
]);
export function summarizeAtlasGates(mode, entries) {
  const indexed = new Map(entries.map((entry) => [entry.id, entry.status]));
  const failed = entries.filter((entry) => entry.status === 'failed').map((entry) => entry.id);
  if (failed.length) return { status: 'blocked', promotionAllowed: false, failed };
  if (mode === 'offline') return { status: 'candidate-offline-only', promotionAllowed: false, failed: [] };
  if (REQUIRED_LOCAL_GATES.some((name) => indexed.get(name) !== 'passed')) {
    return { status: 'incomplete', promotionAllowed: false, failed: [], missing: REQUIRED_LOCAL_GATES.filter((name) => indexed.get(name) !== 'passed') };
  }
  return { status: 'local-gates-passed', promotionAllowed: false, failed: [], next: 'GitHub exact-commit + Windows evidence + manual acceptance before Stable promotion' };
}
