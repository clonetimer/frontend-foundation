import { describe, expect, it, vi } from 'vitest';
import { addLinkedRecordExample } from '../studio/record-template';
import { createNode, createStudioDocument, insertNode, parseStudioFile, removeStudioComponent, serializeStudioDocument, setDecoration } from '../studio/model';
import {
  appendWorkflowTrace, defaultWorkflowStep, interpolateWorkflowText, isWorkflowUrl, isWorkflowVariable,
  normalizeStudioWorkflow, runStudioWorkflow, studioWorkflowRequest, type StudioWorkflow, type WorkflowContext
} from '../studio/studio-workflows';
import { exportedWorkflowRuntime } from '../studio/exported-workflows';
import { projectExportFiles } from '../studio/exporter';

const context = (): WorkflowContext => ({ confirm: () => true, notify: () => {}, navigate: () => {}, saveRecord: async () => {}, refreshRecords: () => {} });

describe('Phase 15: bounded conditional workflows, event targeting, variables and traces', () => {
  it('keeps old sequential workflow steps valid', async () => {
    const old = normalizeStudioWorkflow({ steps: [{ id: 'step-1', type: 'confirm', text: '继续？' }, { id: 'step-2', type: 'notify', text: '完成' }] });
    expect(old?.steps).toHaveLength(2);
    expect(await runStudioWorkflow(old!, context())).toEqual({ status: 'completed', completed: 2 });
  });
  it('keeps nested branches shallow, limits nested actions and validates same-page event targets', () => {
    const value = normalizeStudioWorkflow({ steps: [
      { id: 'step-1', type: 'branch', source: 'selectedId', operator: 'exists', onTrue: [
        { id: 'child', type: 'branch', source: 'selectedId', onTrue: [], onFalse: [] },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `action-${i}`, type: 'notify', text: 'ok' }))
      ], onFalse: [] },
      { id: 'step-2', type: 'emit', targetId: 'outsidePage', action: 'focus' },
      { id: 'step-3', type: 'emit', targetId: 'currentInput', action: 'focus' }
    ] }, ['overview'], ['currentInput']);
    expect(value?.steps).toHaveLength(2);
    expect(value?.steps[0]?.type === 'branch' ? value.steps[0].onTrue.length : 0).toBe(5);
  });
  it('supports literal URL variables, but blocks unsafe paths and protocols', () => {
    expect(isWorkflowUrl('/api/task/{id}')).toBe(true);
    expect(isWorkflowUrl('/api/task/{{results.step-1.data.id}}')).toBe(true);
    expect(isWorkflowUrl('/api/{{window.location}}')).toBe(false);
    expect(isWorkflowUrl('//evil.example')).toBe(false);
    expect(isWorkflowVariable('results.__proto__.polluted')).toBe(false);
    expect(interpolateWorkflowText('/api/{{selectedId}}', { selectedId: 'R/2 ?' }, {}, true)).toBe('/api/R%2F2%20%3F');
  });
  it('runs only the matching branch and passes GET results to subsequent POST and messages', async () => {
    const events: string[] = []; const urls: string[] = []; const bodies: string[] = [];
    const workflow: StudioWorkflow = { steps: [
      { id: 'step-1', type: 'request', method: 'GET', url: '/api/tasks', body: '' },
      { id: 'step-2', type: 'branch', source: 'results.step-1.data.ready', operator: 'equals', expected: 'true',
        onTrue: [{ id: 'yes', type: 'emit', targetId: 'taskTitle', action: 'focus' }],
        onFalse: [{ id: 'no', type: 'notify', text: '未通过' }] },
      { id: 'step-3', type: 'confirm', text: '确认保存？' },
      { id: 'step-4', type: 'request', method: 'POST', url: '/api/{{results.step-1.data.id}}', body: '{"title":"{{draft.title}}"}' }
    ] };
    const result = await runStudioWorkflow(workflow, {
      ...context(), draft: { title: '标题"注入' },
      emit: (target, action) => { events.push(`${target}:${action}`); },
      notify: (text) => { events.push(text); },
      request: async (method, url, body) => { urls.push(url); bodies.push(body); return method === 'GET' ? { data: { ready: true, id: 'r/a' } } : { ok: true }; }
    });
    expect(result).toEqual({ status: 'completed', completed: 5 });
    expect(events).toEqual(['taskTitle:focus']);
    expect(urls).toEqual(['/api/tasks', '/api/r%2Fa']);
    expect(JSON.parse(bodies[1]!)).toEqual({ title: '标题"注入' });
  });
  it('routes a false condition to its fallback steps', async () => {
    const notify = vi.fn();
    const workflow: StudioWorkflow = { steps: [{ id: 'branch', type: 'branch', source: 'selectedId', operator: 'exists', expected: '', onTrue: [{ id: 'yes', type: 'notify', text: 'yes' }], onFalse: [{ id: 'no', type: 'notify', text: 'no' }] }] };
    await runStudioWorkflow(workflow, { ...context(), notify });
    expect(notify).toHaveBeenCalledWith('no'); expect(notify).not.toHaveBeenCalledWith('yes');
  });
  it('requires an approved confirmation even inside a condition branch', async () => {
    const request = vi.fn();
    await expect(runStudioWorkflow({ steps: [{ id: 'branch', type: 'branch', source: 'selectedId', operator: 'exists', expected: '', onTrue: [{ id: 'write', type: 'request', method: 'DELETE', url: '/api/x', body: '' }], onFalse: [] }] }, { ...context(), selectedId: 'S-1', request })).rejects.toThrow('确认');
    expect(request).not.toHaveBeenCalled();
  });
  it('stops safely on cancellation or failed request and never executes later actions', async () => {
    const notify = vi.fn();
    const steps: StudioWorkflow['steps'] = [defaultWorkflowStep('confirm', 'confirm'), { id: 'write', type: 'request', method: 'POST', url: '/api/save', body: '{}' }, { id: 'done', type: 'notify', text: 'done' }];
    expect(await runStudioWorkflow({ steps }, { ...context(), confirm: () => false, notify })).toEqual({ status: 'cancelled', completed: 0 });
    await expect(runStudioWorkflow({ steps }, { ...context(), request: async () => { throw new Error('offline'); }, notify })).rejects.toThrow('offline');
    expect(notify).not.toHaveBeenCalled();
  });
  it('keeps privacy-safe, bounded and ordered execution traces', async () => {
    const traces: Parameters<NonNullable<WorkflowContext['onTrace']>>[0][] = [];
    await runStudioWorkflow({ steps: [{ id: 'step-1', type: 'notify', text: '含敏感信息' }] }, { ...context(), onTrace: (entry) => traces.push(entry) });
    expect(traces.map((entry) => entry.phase)).toEqual(['start', 'start', 'success', 'completed']);
    expect(JSON.stringify(traces)).not.toContain('含敏感信息');
    expect(appendWorkflowTrace(Array.from({ length: 80 }, () => traces[0]!), traces[1]!)).toHaveLength(60);
  });
  it('does not accept unbounded or malformed JSON responses as variables', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { count: 5 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    try { expect(await studioWorkflowRequest('GET', '/api/items', '')).toEqual({ data: { count: 5 } }); }
    finally { globalThis.fetch = original; }
  });
  it('removes references to a deleted target component without removing other steps', () => {
    const original = addLinkedRecordExample(createStudioDocument()).document;
    const page = original.blueprint.pages.find((entry) => entry.id === 'record-editor')!;
    page.composition = insertNode(page.composition!, page.composition!.id, createNode('input', 'temporaryInput'), 'inside');
    page.composition = insertNode(page.composition, page.composition.id, createNode('button', 'workflowTrigger'), 'inside');
    const doc = setDecoration(original, 'record-editor:workflowTrigger', { workflow: { steps: [
      { id: 'step-1', type: 'emit', targetId: 'temporaryInput', action: 'focus' },
      { id: 'step-2', type: 'notify', text: '完成' }
    ] } });
    const restored = parseStudioFile(serializeStudioDocument(doc));
    expect(restored.decorations['record-editor:workflowTrigger']?.workflow?.steps).toHaveLength(2);
    const removed = removeStudioComponent(doc, 'record-editor', 'temporaryInput');
    expect(removed.decorations['record-editor:workflowTrigger']?.workflow?.steps).toHaveLength(1);
  });
  it('exports the exact same declarative runtime and functional target markers', () => {
    const original = addLinkedRecordExample(createStudioDocument()).document;
    const page = original.blueprint.pages.find((entry) => entry.id === 'record-editor')!;
    page.composition = insertNode(page.composition!, page.composition!.id, createNode('button', 'workflowButton'), 'inside');
    const withWorkflow = setDecoration(original, 'record-editor:workflowButton', { workflow: { steps: [
      { id: 'step-1', type: 'branch', source: 'selectedId', operator: 'exists', expected: '', onTrue: [], onFalse: [] }
    ] } });
    const exported = projectExportFiles(withWorkflow);
    expect(exported.find((file) => file.name === 'studio-workflows.ts')?.text).toEqual(exportedWorkflowRuntime);
    expect(exported.find((file) => file.name === 'pages/record-editor.tsx')?.text).toContain('data-studio-component');
    expect(exported.find((file) => file.name === 'studio-records.tsx')?.text).toContain('onTrace:');
    expect(exported.find((file) => file.name === 'studio-effects.css')?.text).toContain('atlas-workflow-highlight');
  });
});
