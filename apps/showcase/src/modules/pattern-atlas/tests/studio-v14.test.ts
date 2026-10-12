import { describe, expect, it, vi } from 'vitest';
import { addLinkedRecordExample } from '../studio/record-template';
import { createNode, createStudioDocument, insertNode, parseStudioFile, removeStudioPage, serializeStudioDocument, setDecoration, insertKinds } from '../studio/model';
import { defaultWorkflowStep, isWorkflowUrl, normalizeStudioWorkflow, runStudioWorkflow, studioWorkflowRequest, type StudioWorkflow } from '../studio/studio-workflows';
import { normalizeWidgetProps, studioWidgetKinds } from '../studio/widgets';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';
import { projectExportFiles, generateReactPage } from '../studio/exporter';

const workflow: StudioWorkflow = { steps: [
  { id:'step-1', type:'confirm', text:'继续？' },
  { id:'step-2', type:'request', method:'POST', url:'/api/studio-records', body:'{"title":"任务"}' },
  { id:'step-3', type:'refresh-records' },
  { id:'step-4', type:'notify', text:'操作完成' }
] };

describe('Phase 14: reusable capabilities and serial workflows', () => {
  it('uses no version-sensitive Divider orientation in preview or standalone export', () => {
    expect(exportedWidgetPreview).toContain('<Divider>{title}</Divider>');
    expect(exportedWidgetPreview).not.toContain('orientation="left"');
    expect(exportedWidgetPreview).not.toContain('orientation="start"');
  });
  it('registers usable file, async and visualization components in the palette', () => {
    expect(insertKinds).toEqual(expect.arrayContaining(['file-upload','file-list','async-task','async-log','line-chart','donut-chart','heatmap']));
    expect(studioWidgetKinds.size).toBe(33);
    expect(exportedWidgetCatalog).toContain("kind: 'async-task'");
    expect(exportedWidgetPreview).toContain('fetch(url');
  });
  it('bounds risky widget settings while retaining readable visual content', () => {
    expect(normalizeWidgetProps('file-upload', { maxSizeMb:999, uploadUrl:'https://example.com/upload' }).maxSizeMb).toBe(30);
    expect(normalizeWidgetProps('async-task', { pollMs:100, statusUrl:'/api/task' }).pollMs).toBe(1500);
    expect(normalizeWidgetProps('heatmap', { values:'100,30,50' }).values).toBe('100,30,50');
  });
  it('supports both old Studio designs and new workflow round trips without touching the Blueprint', () => {
    const original = createStudioDocument();
    const old = parseStudioFile(serializeStudioDocument(original));
    expect(old.decorations).toEqual({});
    const page = original.blueprint.pages[0]!;
    const updated = setDecoration(original, `${page.id}:${page.composition!.id}`, { widgetKind: 'heatmap' });
    expect(updated.blueprint).toEqual(original.blueprint);
    const linked = addLinkedRecordExample(original).document;
    const restored = parseStudioFile(serializeStudioDocument(linked));
    expect(restored.decorations['record-editor:recordSave']?.workflow?.steps.map((step) => step.type)).toEqual(['confirm','save-record','notify']);
    expect(restored.blueprint).toEqual(linked.blueprint);
  });
  it('keeps workflows attached to the right button and removes invalid URLs and steps', () => {
    expect(normalizeStudioWorkflow({ steps: [{ id:'step-1', type:'request', method:'POST', url:'javascript:alert(1)', body:'' }] })).toBeUndefined();
    expect(normalizeStudioWorkflow({ steps: [{ id:'step-1', type:'notify', text:'hello' }, { id:'step-1', type:'notify', text:'duplicate' }] })?.steps).toHaveLength(1);
    expect(defaultWorkflowStep('save-record','save-one')).toEqual({ id:'save-one',type:'save-record' });
    expect(isWorkflowUrl('/api/task/{id}')).toBe(true);
    expect(isWorkflowUrl('javascript:alert(1)')).toBe(false);
    expect(isWorkflowUrl('//example.org/api')).toBe(false);
  });
  it('requires approval before any destructive side effect', async () => {
    const noConfirm: StudioWorkflow = { steps:[{ id:'step-1',type:'request',method:'DELETE',url:'/api/studio-records/{id}',body:'' }] };
    await expect(runStudioWorkflow(noConfirm, { confirm:()=>true, notify:()=>{}, navigate:()=>{}, saveRecord:async()=>{}, refreshRecords:()=>{}, selectedId:'S-1' })).rejects.toThrow('确认');
  });
  it('does not perform writes if the user cancels confirmation', async () => {
    const request = vi.fn();
    expect(await runStudioWorkflow(workflow, { confirm:()=>false, notify:()=>{}, navigate:()=>{}, saveRecord:async()=>{}, refreshRecords:()=>{}, request })).toEqual({status:'cancelled',completed:0});
    expect(request).not.toHaveBeenCalled();
  });
  it('runs confirm, POST, refresh and feedback in order', async () => {
    const order: string[] = [];
    const result = await runStudioWorkflow(workflow, { confirm:()=>{order.push('confirm');return true;}, request:async(method,url)=>{order.push(`${method} ${url}`);}, refreshRecords:()=>{order.push('refresh');}, notify:(text)=>{order.push(text);}, navigate:()=>{}, saveRecord:async()=>{} });
    expect(order).toEqual(['confirm','POST /api/studio-records','refresh','操作完成']);
    expect(result).toEqual({status:'completed',completed:4});
  });
  it('encodes a selected record into one URL slot, rejecting missing selection', async () => {
    let called = '';
    const steps: StudioWorkflow = { steps:[{id:'step-1',type:'request',method:'GET',url:'/api/{id}',body:''}] };
    const context = { confirm:()=>true, notify:()=>{}, navigate:()=>{}, refreshRecords:()=>{}, saveRecord:async()=>{}, request:async (_method:string,url:string)=>{called=url;} };
    await expect(runStudioWorkflow(steps,context)).rejects.toThrow('选择记录');
    await runStudioWorkflow(steps,{...context, selectedId:'R/1 ?'});
    expect(called).toBe('/api/R%2F1%20%3F');
  });
  it('stops the chain on a failed request without running later steps', async () => {
    const notify = vi.fn();
    await expect(runStudioWorkflow(workflow, { confirm:()=>true, notify, navigate:()=>{}, saveRecord:async()=>{}, refreshRecords:()=>{}, request:async()=>{throw new Error('offline');} })).rejects.toThrow('offline');
    expect(notify).not.toHaveBeenCalled();
  });
  it('makes only explicitly configured HTTP requests', async () => {
    const fetchBefore = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push(`${init?.method} ${url}`); return new Response(null, {status:204}); }) as typeof fetch;
    try {
      await studioWorkflowRequest('GET','/api/task','');
      expect(calls).toEqual(['GET /api/task']);
      await expect(studioWorkflowRequest('POST','/api/task','{bad')).rejects.toThrow('JSON');
      expect(calls).toHaveLength(1);
    } finally { globalThis.fetch = fetchBefore; }
  });
  it('exports new widgets and the runnable workflow code, not just a visual placeholder', () => {
    const initial = addLinkedRecordExample(createStudioDocument()).document;
    const page = initial.blueprint.pages.find((page) => page.id === 'record-editor')!;
    page.composition = insertNode(page.composition!, page.composition!.children![0]!.id, createNode('file-upload','widget-upload'), 'inside');
    const decorated = setDecoration(initial, 'record-editor:widget-upload', { widgetKind:'file-upload', widgetProps:normalizeWidgetProps('file-upload', {uploadUrl:'/api/studio-upload-demo'}) });
    const files = projectExportFiles(decorated);
    const pageText = generateReactPage(decorated, 'record-editor');
    expect(pageText).toContain('StudioWorkflowButton');
    expect(pageText).toContain('kind={"file-upload"}');
    expect(files.find((item) => item.name === 'studio-records.tsx')!.text).toContain('runStudioWorkflow(workflow');
    expect(files.find((item) => item.name === 'studio-workflows.ts')!.text).toContain('studioWorkflowRequest');
    expect(files.find((item) => item.name === 'studio-widget-preview.tsx')!.text).toContain('FileUploadWidget');
    expect(files.find((item) => item.name === 'atlas.studio.json')!.text).toContain('save-record');
  });
});
