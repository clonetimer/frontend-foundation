import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStudioWorkflow, normalizeStudioWorkflow, interpolateWorkflowText, isWorkflowUrl
} from '../../apps/showcase/src/modules/pattern-atlas/studio/studio-workflows.ts';

function context(extra = {}) {
  return { confirm: async () => true, notify: () => {}, navigate: () => {},
    saveRecord: async () => {}, refreshRecords: () => {}, ...extra };
}
test('v14 workflows still execute with the v16 runtime', async () => {
  const old = normalizeStudioWorkflow({ steps: [
    { id: 'step-1', type: 'confirm', text: '继续？' },
    { id: 'step-2', type: 'notify', text: '完成' }
  ] });
  assert.ok(old);
  const notifications = [];
  const result = await runStudioWorkflow(old, context({ notify: (text) => notifications.push(text) }));
  assert.deepEqual(result, { status: 'completed', completed: 2 });
  assert.deepEqual(notifications, ['完成']);
});
test('latest run starts anew, marks the unused condition branch skipped, and logs no payload', async () => {
  const traces = [];
  const actions = [];
  const result = await runStudioWorkflow({ steps: [
    { id: 'read', type: 'request', method: 'GET', url: '/api/readonly', body: '' },
    { id: 'branch', type: 'branch', source: 'results.read.data.ok', operator: 'equals', expected: 'yes',
      onTrue: [{ id: 'right', type: 'notify', text: 'private-notice' }],
      onFalse: [{ id: 'wrong', type: 'notify', text: 'fail' }] }
  ] }, context({
    request: async () => ({ data: { ok: 'yes', privateToken: 'must-never-be-persisted' } }),
    notify: (message) => actions.push(message),
    onTrace: (event) => traces.push(event)
  }));
  assert.deepEqual(result, { status: 'completed', completed: 3 });
  assert.deepEqual(actions, ['private-notice']);
  assert.deepEqual(traces.map((event) => event.phase), ['start','start','success','start','success','skipped','start','success','completed']);
  assert.equal(traces.find((event) => event.stepId === 'wrong')?.phase, 'skipped');
  assert.doesNotMatch(JSON.stringify(traces), /private-notice|must-never-be-persisted|\/api\/readonly/);
});
test('write requests without an explicit confirmation are blocked', async () => {
  let called = false;
  await assert.rejects(runStudioWorkflow({ steps: [
    { id: 'unsafe', type: 'request', method: 'DELETE', url: '/api/items/1', body: '' }
  ] }, context({ request: async () => { called = true; } })), /确认/);
  assert.equal(called, false);
});
test('cancelled confirmation stops all later steps', async () => {
  let called = false;
  const result = await runStudioWorkflow({ steps: [
    { id: 'ask', type: 'confirm', text: '继续？' },
    { id: 'next', type: 'request', method: 'POST', url: '/api/items', body: '{}' }
  ] }, context({ confirm: () => false, request: async () => { called = true; } }));
  assert.equal(result.status, 'cancelled');
  assert.equal(called, false);
});
test('unsafe URLs and untrusted variables cannot execute scripts', () => {
  assert.equal(isWorkflowUrl('javascript:alert(1)'), false);
  assert.equal(isWorkflowUrl('//unsafe.example'), false);
  assert.throws(() => interpolateWorkflowText('{{results.__proto__.foo}}', {}, {}), /变量写法无效/);
});
