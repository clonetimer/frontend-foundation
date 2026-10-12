/** Bounded, declarative workflows. This module is copied unchanged into standalone exports.
 * No scripts, credentials, unbounded loops or persisted response payloads.
 */
export type WorkflowMethod = 'GET' | 'POST' | 'DELETE';
export type WorkflowEmitAction = 'highlight' | 'focus';
export type WorkflowActionStep =
  | { id: string; type: 'confirm'; text: string }
  | { id: string; type: 'request'; method: WorkflowMethod; url: string; body: string }
  | { id: string; type: 'save-record' }
  | { id: string; type: 'refresh-records' }
  | { id: string; type: 'notify'; text: string }
  | { id: string; type: 'navigate'; pageId: string }
  | { id: string; type: 'emit'; targetId: string; action: WorkflowEmitAction };
export type WorkflowStep = WorkflowActionStep | {
  id: string; type: 'branch'; source: string;
  operator: 'exists' | 'equals' | 'not-equals' | 'contains'; expected: string;
  onTrue: WorkflowActionStep[]; onFalse: WorkflowActionStep[];
};
export interface StudioWorkflow { steps: WorkflowStep[] }
export type WorkflowStepType = WorkflowStep['type'];
export const workflowStepTypes: readonly WorkflowStepType[] = ['confirm', 'request', 'save-record', 'refresh-records', 'notify', 'navigate', 'branch', 'emit'];
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const targetIdentifier = /^[A-Za-z][A-Za-z\d_-]{0,79}$/;
const variableReference = /\{\{\s*(selectedId|draft\.[A-Za-z][\w-]{0,63}|results\.[a-z][a-z0-9-]{0,63}(?:\.[A-Za-z][\w-]{0,63}|\.[0-9]{1,4}){0,5})\s*\}\}/g;
const variableName = /^(?:selectedId|draft\.[A-Za-z][\w-]{0,63}|results\.[a-z][a-z0-9-]{0,63}(?:\.[A-Za-z][\w-]{0,63}|\.[0-9]{1,4}){0,5})$/;
const forbiddenKey = new Set(['__proto__', 'constructor', 'prototype']);
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function isWorkflowVariable(value: string): boolean { return value.length <= 200 && variableName.test(value) && !value.split('.').some((part) => forbiddenKey.has(part)); }
function containsUnsafeTemplate(value: string): boolean {
  return /\{\{|\}\}/.test(value.replace(variableReference, ''));
}
export function isWorkflowUrl(url: string): boolean {
  if (!url || url.length > 500 || Array.from(url).some((char) => char.charCodeAt(0) <= 32 || char === '\\') || url.startsWith('//') || containsUnsafeTemplate(url)) return false;
  const example = url.replaceAll('{id}', 'example').replace(variableReference, 'example');
  if (/[{}]/.test(example)) return false;
  if (example.startsWith('/')) return !example.startsWith('//');
  try { const target = new URL(example); return (target.protocol === 'http:' || target.protocol === 'https:') && !target.username && !target.password; }
  catch { return false; }
}
export function defaultWorkflowStep(type: WorkflowStepType, id = 'step-1'): WorkflowStep {
  switch (type) {
    case 'confirm': return { id, type, text: '确定执行此操作？' };
    case 'request': return { id, type, method: 'GET', url: '', body: '' };
    case 'notify': return { id, type, text: '操作已完成' };
    case 'navigate': return { id, type, pageId: '' };
    case 'emit': return { id, type, targetId: '', action: 'highlight' };
    case 'branch': return { id, type, source: 'selectedId', operator: 'exists', expected: '', onTrue: [], onFalse: [] };
    case 'save-record': case 'refresh-records': return { id, type };
  }
}
function normalizeStep(raw: unknown, validPages: readonly string[], validTargets: readonly string[], insideBranch: boolean): WorkflowStep | undefined {
  if (!record(raw) || typeof raw.id !== 'string' || !identifier.test(raw.id) || !workflowStepTypes.includes(raw.type as WorkflowStepType)) return undefined;
  const id = raw.id; const type = raw.type as WorkflowStepType;
  if (type === 'confirm' || type === 'notify') return { id, type, text: typeof raw.text === 'string' ? raw.text.slice(0, 240) : '' };
  if (type === 'request') {
    const method: WorkflowMethod = raw.method === 'POST' || raw.method === 'DELETE' ? raw.method : 'GET';
    const url = typeof raw.url === 'string' ? raw.url.trim().slice(0, 500) : '';
    if (url && !isWorkflowUrl(url)) return undefined;
    const body = typeof raw.body === 'string' ? raw.body.slice(0, 2000) : '';
    return { id, type, method, url, body: method === 'POST' ? body : '' };
  }
  if (type === 'navigate') {
    const pageId = typeof raw.pageId === 'string' ? raw.pageId : '';
    return { id, type, pageId: !pageId || validPages.includes(pageId) ? pageId : '' };
  }
  if (type === 'emit') {
    const targetId = typeof raw.targetId === 'string' ? raw.targetId : '';
    if (targetId && (!targetIdentifier.test(targetId) || (validTargets.length && !validTargets.includes(targetId)))) return undefined;
    return { id, type, targetId, action: raw.action === 'focus' ? 'focus' : 'highlight' };
  }
  if (type === 'branch') {
    if (insideBranch) return undefined; // no recursion or loops
    const source = typeof raw.source === 'string' && isWorkflowVariable(raw.source) ? raw.source : 'selectedId';
    const operator = ['equals', 'not-equals', 'contains'].includes(String(raw.operator)) ? raw.operator as 'equals' | 'not-equals' | 'contains' : 'exists';
    const expected = typeof raw.expected === 'string' ? raw.expected.slice(0, 240) : '';
    const nested = (value: unknown) => {
      const seen = new Set<string>();
      return (Array.isArray(value) ? value.slice(0, 6) : []).flatMap((item: unknown) => {
        const step = normalizeStep(item, validPages, validTargets, true);
        if (!step || step.type === 'branch' || seen.has(step.id)) return [];
        seen.add(step.id); return [step];
      }) as WorkflowActionStep[];
    };
    return { id, type, source, operator, expected, onTrue: nested(raw.onTrue), onFalse: nested(raw.onFalse) };
  }
  return { id, type } as WorkflowActionStep;
}
/** Backward compatible with v14 workflows: optional target catalog only tightens new emit actions. */
export function normalizeStudioWorkflow(value: unknown, validPages: readonly string[] = [], validTargets: readonly string[] = []): StudioWorkflow | undefined {
  if (!record(value) || !Array.isArray(value.steps)) return undefined;
  const steps: WorkflowStep[] = []; const seen = new Set<string>();
  for (const raw of value.steps.slice(0, 12)) {
    const step = normalizeStep(raw, validPages, validTargets, false);
    if (!step || seen.has(step.id)) continue;
    seen.add(step.id); steps.push(step);
  }
  return steps.length ? { steps } : undefined;
}
export interface WorkflowTrace {
  stepId: string; stepType: WorkflowStepType | 'workflow'; phase: 'start' | 'success' | 'error' | 'cancelled' | 'completed' | 'skipped'; at: number;
  /** Intentionally excludes URLs, request/response bodies, input values and credentials. */
  message?: string;
  sourceId?: string;
  /** Opaque per-invocation identifier; keeps graph status correct when old traces are evicted. */
  runId?: string;
}
export function appendWorkflowTrace(previous: readonly WorkflowTrace[], event: WorkflowTrace): WorkflowTrace[] {
  return [...previous.slice(-59), event];
}
export interface WorkflowContext {
  confirm: (text: string) => boolean | Promise<boolean>;
  notify: (text: string) => void;
  navigate: (pageId: string) => void;
  saveRecord: () => Promise<void>;
  refreshRecords: () => void;
  selectedId?: string;
  draft?: Record<string, string>;
  signal?: AbortSignal;
  onStep?: (step: WorkflowStep, index: number) => void;
  onTrace?: (trace: WorkflowTrace) => void;
  emit?: (targetId: string, action: WorkflowEmitAction) => void | Promise<void>;
  request?: (method: WorkflowMethod, url: string, body: string, signal?: AbortSignal) => Promise<unknown>;
}
export type WorkflowResult = { status: 'completed' | 'cancelled'; completed: number };
export function workflowVariable(source: string, context: Pick<WorkflowContext, 'selectedId' | 'draft'>, results: Record<string, unknown>): unknown {
  if (!isWorkflowVariable(source)) throw new Error('不支持的工作流变量路径。');
  if (source === 'selectedId') return context.selectedId;
  const path = source.split('.');
  let value: unknown = path[0] === 'draft' ? context.draft : results;
  const keys = path[0] === 'results' ? path.slice(1) : path.slice(1);
  for (const key of keys) {
    if (value === null || typeof value !== 'object' || forbiddenKey.has(key) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 1500);
  return String(value).slice(0, 1500);
}
export function interpolateWorkflowText(input: string, context: Pick<WorkflowContext, 'selectedId' | 'draft'>, results: Record<string, unknown>, forUrl = false): string {
  if (containsUnsafeTemplate(input)) throw new Error('变量写法无效，请使用 {{selectedId}}、{{draft.title}} 或 {{results.step-2.data.id}}。');
  return input.replace(variableReference, (_, source: string) => {
    const value = workflowVariable(source, context, results);
    if (value === undefined || value === null) throw new Error('工作流变量尚无值。');
    if (forUrl && typeof value === 'object') throw new Error('URL 变量必须为文本或数字。');
    return forUrl ? encodeURIComponent(toText(value)) : toText(value);
  });
}
function requestBody(body: string, context: Pick<WorkflowContext, 'selectedId' | 'draft'>, results: Record<string, unknown>): string {
  if (!body.trim()) return '';
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error('POST 请求体必须是 JSON。'); }
  const map = (value: unknown, depth: number): unknown => {
    if (depth > 8) throw new Error('请求体嵌套过深。');
    if (typeof value === 'string') return interpolateWorkflowText(value, context, results);
    if (Array.isArray(value)) return value.map((item) => map(item, depth + 1));
    if (record(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !forbiddenKey.has(key)).map(([key, item]) => [key, map(item, depth + 1)]));
    return value;
  };
  const result = JSON.stringify(map(parsed, 0));
  if (result.length > 8192) throw new Error('请求体大小超过限制。');
  return result;
}
/** Parses bounded JSON responses for later steps; does not log or persist any payload. */
export async function studioWorkflowRequest(method: WorkflowMethod, url: string, body: string, signal?: AbortSignal): Promise<unknown> {
  if (!isWorkflowUrl(url)) throw new Error('工作流接口地址无效。');
  let payload: string | undefined;
  if (method === 'POST' && body.trim()) {
    try { payload = JSON.stringify(JSON.parse(body)); } catch { throw new Error('POST 请求体必须是 JSON。'); }
  }
  const response = await fetch(url, { method, credentials: 'same-origin', ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: payload } : {}), ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`接口请求失败：HTTP ${response.status}`);
  if (response.status === 204 || !response.headers.get('Content-Type')?.includes('application/json')) return undefined;
  const size = Number(response.headers.get('Content-Length') ?? 0);
  if (size > 65536) throw new Error('接口响应过大，不能作为工作流变量。');
  const text = (await response.text()).slice(0, 65537);
  if (text.length > 65536) throw new Error('接口响应过大，不能作为工作流变量。');
  try { return JSON.parse(text); } catch { throw new Error('接口响应不是有效 JSON。'); }
}
function evaluateCondition(step: Extract<WorkflowStep, { type: 'branch' }>, context: WorkflowContext, results: Record<string, unknown>): boolean {
  const actual = workflowVariable(step.source, context, results);
  const expected = interpolateWorkflowText(step.expected, context, results);
  if (step.operator === 'exists') return actual !== undefined && actual !== null && actual !== '';
  if (step.operator === 'equals') return toText(actual) === expected;
  if (step.operator === 'not-equals') return toText(actual) !== expected;
  return toText(actual).includes(expected);
}
/** Simple bounded component events; no implicit DOM click or script execution. */
export function dispatchWorkflowComponentEvent(targetId: string, action: WorkflowEmitAction, host?: ParentNode): void {
  if (!targetIdentifier.test(targetId)) throw new Error('目标组件标识无效。');
  const scope = host ?? document;
  const target = Array.from(scope.querySelectorAll<HTMLElement>('[data-studio-component]')).find((element) => element.dataset.studioComponent === targetId);
  if (!target) throw new Error('目标组件在当前页面中不可见。');
  if (action === 'focus') {
    const input = target.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]') ?? target;
    input.focus();
  } else {
    target.classList.remove('atlas-workflow-highlight');
    // restart animation without using synthetic clicks or arbitrary event handlers
    void target.offsetWidth;
    target.classList.add('atlas-workflow-highlight');
  }
}
let workflowSequence = 0;
export async function runStudioWorkflow(workflow: StudioWorkflow, context: WorkflowContext): Promise<WorkflowResult> {
  if (!workflow.steps.length) throw new Error('尚未添加工作流步骤。');
  let approved = false; let completed = 0;
  const runId = `${Date.now().toString(36)}-${++workflowSequence}`;
  // Responses live only for one invocation; never saved to design files or traces.
  const results: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const trace = (step: WorkflowStep | null, phase: WorkflowTrace['phase']) => context.onTrace?.({ stepId: step?.id ?? 'workflow', stepType: step?.type ?? 'workflow', phase, at: Date.now(), runId });
  const runAction = async (step: WorkflowActionStep): Promise<boolean> => {
    if (context.signal?.aborted) throw new Error('工作流已取消。');
    trace(step, 'start');
    try {
      if (step.type === 'confirm') {
        if (!await context.confirm(interpolateWorkflowText(step.text || '确定继续？', context, results))) { trace(step, 'cancelled'); return false; }
        approved = true;
      } else if (step.type === 'request') {
        if ((step.method === 'POST' || step.method === 'DELETE') && !approved) throw new Error('执行写入或删除请求前必须添加确认步骤。');
        const url = interpolateWorkflowText(step.url.replaceAll('{id}', '{{selectedId}}'), context, results, true);
        if (!isWorkflowUrl(url)) throw new Error('请求 URL 无效。');
        const body = step.method === 'POST' ? requestBody(step.body, context, results) : '';
        results[step.id] = await (context.request ?? studioWorkflowRequest)(step.method, url, body, context.signal);
      } else if (step.type === 'save-record') {
        if (!approved) throw new Error('保存业务记录前必须添加确认步骤。');
        await context.saveRecord();
      } else if (step.type === 'refresh-records') context.refreshRecords();
      else if (step.type === 'notify') context.notify(interpolateWorkflowText(step.text, context, results));
      else if (step.type === 'navigate') { if (!step.pageId) throw new Error('尚未设置目标页面。'); context.navigate(step.pageId); }
      else if (step.type === 'emit') {
        if (!step.targetId) throw new Error('尚未指定目标组件。');
        await (context.emit ?? dispatchWorkflowComponentEvent)(step.targetId, step.action);
      }
      completed++; trace(step, 'success'); return true;
    } catch (error) { trace(step, 'error'); throw error; }
  };
  trace(null, 'start');
  try {
    for (const [index, step] of workflow.steps.entries()) {
      context.onStep?.(step, index);
      if (step.type === 'branch') {
        trace(step, 'start');
        let chosen: WorkflowActionStep[];
        let match: boolean;
        try { match = evaluateCondition(step, context, results); chosen = match ? step.onTrue : step.onFalse; }
        catch (error) { trace(step, 'error'); throw error; }
        trace(step, 'success'); completed++;
        for (const skipped of (match ? step.onFalse : step.onTrue)) trace(skipped, 'skipped');
        for (const child of chosen) if (!await runAction(child)) { trace(null, 'cancelled'); return { status: 'cancelled', completed }; }
      } else if (!await runAction(step)) { trace(null, 'cancelled'); return { status: 'cancelled', completed }; }
    }
  } catch (error) { trace(null, 'error'); throw error; }
  trace(null, 'completed');
  return { status: 'completed', completed };
}
