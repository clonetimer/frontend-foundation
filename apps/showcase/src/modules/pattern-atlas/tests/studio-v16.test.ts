import { describe, expect, it, vi } from 'vitest';
import { workflowGraphState, workflowGraphSummary } from '../studio/WorkflowGraph';
import { normalizeStudioWorkflow, runStudioWorkflow, type WorkflowTrace } from '../studio/studio-workflows';
import { exportedWorkflowRuntime } from '../studio/exported-workflows';
import { projectExportFiles } from '../studio/exporter';
import { createStudioDocument, setDecoration, serializeStudioDocument, parseStudioFile, createNode, insertNode } from '../studio/model';

const base = { confirm: () => true, notify: () => {}, navigate: () => {}, saveRecord: async () => {}, refreshRecords: () => {} };

describe('Phase 16 · workflow graph, traces, and release regressions', () => {
  it('builds pending graph state without ever inventing execution', () => {
    expect(workflowGraphState([], 'save').hasRun).toBe(false);
    expect(workflowGraphState([], 'save').phases['one']).toBeUndefined();
  });
  it('shows only current source and the most recent workflow execution', () => {
    const time = 1;
    const trace = (sourceId: string, stepId: string, stepType: WorkflowTrace['stepType'], phase: WorkflowTrace['phase']): WorkflowTrace => ({ sourceId, stepId, stepType, phase, at: time });
    const entries = [
      trace('save', 'workflow', 'workflow', 'start'), trace('save', 'one', 'notify', 'error'),
      trace('other', 'workflow', 'workflow', 'start'), trace('other', 'one', 'notify', 'success'),
      trace('save', 'workflow', 'workflow', 'start'), trace('save', 'two', 'request', 'success')
    ];
    const current = workflowGraphState(entries, 'save');
    expect(current.hasRun).toBe(true);
    expect(current.phases['one']).toBeUndefined();
    expect(current.phases['two']).toBe('success');
  });
  it('still identifies the latest run when a long workflow has evicted the start marker', () => {
    const entry = (runId: string, stepId: string, phase: WorkflowTrace['phase']): WorkflowTrace => ({ sourceId: 'save', runId, stepId, stepType: 'notify', phase, at: 1 });
    const traces = [entry('old', 'obsolete', 'error'), ...Array.from({ length: 60 }, (_, i) => entry('latest', `step-${i}`, 'success'))];
    const graph = workflowGraphState(traces.slice(-60), 'save');
    expect(graph.hasRun).toBe(true);
    expect(graph.phases['obsolete']).toBeUndefined();
    expect(graph.phases['step-59']).toBe('success');
  });
  it('traces the unchosen branch as skipped without exposing response data', async () => {
    const traces: WorkflowTrace[] = []; const notify = vi.fn();
    const workflow = normalizeStudioWorkflow({ steps: [{
      id: 'condition', type: 'branch', source: 'selectedId', operator: 'exists', onTrue: [{ id: 'on', type: 'notify', text: 'confidential-text' }],
      onFalse: [{ id: 'off', type: 'notify', text: 'not found' }]
    }] })!;
    await runStudioWorkflow(workflow, { ...base, selectedId: 'A', notify, onTrace: (entry) => traces.push(entry) });
    const phases = workflowGraphState(traces.map((entry) => ({ ...entry, sourceId: 'save' })), 'save').phases;
    expect(phases['condition']).toBe('success');
    expect(phases['on']).toBe('success');
    expect(phases['off']).toBe('skipped');
    expect(notify).toHaveBeenCalledWith('confidential-text');
    expect(JSON.stringify(traces)).not.toContain('confidential-text');
  });
  it('does not display sensitive API addresses in execution traces', async () => {
    const traces: WorkflowTrace[] = [];
    await runStudioWorkflow({ steps: [{ id: 'fetch', type: 'request', method: 'GET', url: '/api/private/resource', body: '' }] },
      { ...base, request: async () => ({ privateValue: 'secret-123' }), onTrace: (entry) => traces.push(entry) });
    expect(JSON.stringify(traces)).not.toContain('/api/private/resource');
    expect(JSON.stringify(traces)).not.toContain('secret-123');
  });
  it('renders concise action captions from the declarative model', () => {
    expect(workflowGraphSummary({ id: 'r', type: 'request', method: 'GET', url: '/api/tasks', body: '' })).toContain('GET');
    expect(workflowGraphSummary({ id: 'b', type: 'branch', source: 'selectedId', operator: 'exists', expected: '', onTrue: [], onFalse: [] })).toContain('selectedId');
  });
  it('keeps old workflow files readable and exports the EXACT executed runtime', () => {
    let studio = createStudioDocument();
    const page = studio.blueprint.pages[0]!;
    page.composition = insertNode(page.composition!, page.composition!.id, createNode('button', 'runFlow'), 'inside');
    studio = setDecoration(studio, `${page.id}:runFlow`, { workflow: { steps: [
      { id: 'step-1', type: 'confirm', text: '确认？' }, { id: 'step-2', type: 'notify', text: '完成' }
    ] } });
    const restored = parseStudioFile(serializeStudioDocument(studio));
    expect(restored.decorations[`${page.id}:runFlow`]?.workflow?.steps).toHaveLength(2);
    const exported = projectExportFiles(restored);
    expect(exported.find((file) => file.name === 'studio-workflows.ts')?.text).toBe(exportedWorkflowRuntime);
    expect(exportedWorkflowRuntime).toContain("trace(null, 'start')");
    expect(exportedWorkflowRuntime).toContain("trace(skipped, 'skipped')");
  });
});
