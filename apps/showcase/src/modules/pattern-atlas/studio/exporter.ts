import type { CompositionNode } from '../bridge';
import { designCssVariables } from '../effects/config';
import { nodeLabel, serializeStudioDocument, walkNodes, type StudioDecoration, type StudioDocument } from './model';
import { findRecordFields, type StudioRecordListBinding } from './record-bindings';
import { exportedRecordRuntime } from './record-exporter';
import { resolveRecordList, resolveRecordSubmit } from './data-sources';
import { studioEffectStyles } from './effect-styles';
import { exportedWidgetCatalog, exportedWidgetPreview } from './exported-widgets';
import { exportedWorkflowRuntime } from './exported-workflows';
import { studioWidgetStyles } from './widget-styles';
import { findRecordRules } from './record-bindings';

function json(value: unknown): string {
  // Preserve generated JSX expression boundaries for untrusted user-authored text.
  return JSON.stringify(value ?? null).replace(/[<>&\u2028\u2029]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}
function stringValue(value: unknown, fallback = ''): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }
function num(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
const buttonTypes = new Set(['primary', 'default', 'dashed', 'text', 'link']);
const clickableEffects = new Set(['flip', 'morph-toggle', 'success-check', 'ripple']);

export const exportedPageStyles = `${studioEffectStyles}
${studioWidgetStyles}
.atlas-export-page{min-height:100%;padding:22px;position:relative;background:var(--atlas-surface,#f7faf9);color:var(--atlas-ink,#223b34);font-family:var(--pa-fx-font,system-ui,sans-serif)}
/* Absolute components anchor to the page content plane, not nested layouts. */
.atlas-page-absolute-layer{position:absolute;inset:22px 22px 0;z-index:4;pointer-events:none}
.atlas-page-absolute-layer>.atlas-export-node{pointer-events:auto}
.atlas-export-node{min-width:0;position:relative;box-sizing:border-box}
.atlas-export-node[style*="height"]>.atlas-export-metric,.atlas-export-node[style*="height"]>.atlas-export-panel,.atlas-export-node[style*="height"]>.atlas-export-placeholder{height:100%;min-height:0}
.atlas-app-shell{min-height:100vh;display:flex;background:#f5f8f6;font-family:system-ui,sans-serif;color:#284237}
.atlas-app-sidebar{width:var(--app-sidebar-width,188px);flex:0 0 var(--app-sidebar-width,188px);background:#eef5f0;border-right:1px solid #d7e5dc;padding:22px 11px}
.atlas-app-brand{font-size:17px;font-weight:850;margin-bottom:20px;overflow-wrap:anywhere}
.atlas-app-nav{display:flex;flex-direction:column;gap:6px}
.atlas-app-nav a{color:#3a6350;display:block;text-decoration:none;padding:11px 13px;border-radius:9px}
.atlas-app-nav a.active{background:#d9ebe0;color:#15633f;font-weight:800}
.atlas-app-main{flex:1;min-width:0}
.atlas-app-top{flex-direction:column}
.atlas-app-top .atlas-app-sidebar{width:100%;flex:0 0 auto;border-right:0;border-bottom:1px solid #d7e5dc;padding:12px 22px;display:flex;align-items:center;gap:20px}
.atlas-app-top .atlas-app-brand{margin:0}
.atlas-app-top .atlas-app-nav{flex-direction:row;flex-wrap:wrap}
.atlas-app-none .atlas-app-sidebar{display:none}
@media(max-width:650px){.atlas-app-shell{flex-direction:column}.atlas-app-shell .atlas-app-sidebar{width:100%;flex:0 0 auto;border-right:0;border-bottom:1px solid #d7e5dc;padding:12px}.atlas-app-brand{font-size:14px;margin:0 0 7px}.atlas-app-nav{flex-direction:row;overflow:auto}.atlas-app-nav a{white-space:nowrap;padding:8px 10px;font-size:13px}}

.atlas-export-stack{display:flex;flex-direction:column;position:relative}
.atlas-export-stack:has(> .atlas-absolute){min-height:260px}
.atlas-export-panel{border:1px solid #e3eae6;border-radius:var(--pa-fx-radius,14px);background:var(--atlas-panel,#fff);padding:18px;box-shadow:var(--pa-fx-shadow,none);position:relative}
.atlas-export-panel:has(> .atlas-absolute){min-height:260px}
.atlas-export-panel>strong{display:block;margin-bottom:12px;font-size:14px}
.atlas-export-metric{padding:18px;border-radius:var(--pa-fx-radius,14px);border:1px solid #e6ece8;background:var(--atlas-panel,#fff)}
.atlas-export-metric small{display:block;color:#789084;font-size:12px}
.atlas-export-metric strong{display:block;font-size:28px;letter-spacing:-.04em;color:var(--pa-fx-accent,#11765c);margin-top:7px}
.atlas-export-placeholder{padding:26px;border-radius:10px;border:1px dashed #aebdb4;background:#f6faf8;text-align:center;color:#60776e}
.atlas-export-placeholder small{display:block;margin-top:7px}
.atlas-export-field{display:flex;flex-direction:column;gap:8px}
.atlas-export-field label{font-size:12px;color:#74877d}
.atlas-record-list{min-height:110px;display:flex;flex-direction:column;gap:11px;font-size:13px}
.atlas-record-rows{display:flex;flex-direction:column;gap:5px;max-height:350px;overflow:auto}
.atlas-record-rows button{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;padding:10px 12px;background:#fff;color:#345c42;cursor:pointer;border:1px solid #dce9e0;border-radius:9px}
.atlas-record-rows button.active,.atlas-record-rows button:hover{background:#e9f5ed;border-color:#5aaf88}
.atlas-record-rows button small{color:#789187;font-size:11px}
.atlas-record-search{display:flex;gap:6px;min-width:0;align-items:center}
.atlas-record-search .ant-input{min-width:0;flex:1}
.atlas-record-search .ant-btn{flex:none}
.atlas-record-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.atlas-record-actions .ant-select{flex:1 1 110px;max-width:100%}
.atlas-record-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;font-size:12px}
.atlas-record-error{display:block;color:#bb2727;font-size:11px}
.atlas-export-tabs .ant-tabs-nav{margin-bottom:18px}
.atlas-export-page h2{font-size:clamp(20px,2vw,28px);margin:0}
.atlas-export-page h3{font-size:18px;margin:0}
.atlas-export-page p{margin:0;line-height:1.7}
.atlas-export-page .atlas-muted{color:#778a80}
.atlas-export-page .atlas-effect-bento{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
.atlas-export-page .atlas-effect-bento>.atlas-fx:first-child{grid-column:span 2}
.atlas-export-page .atlas-effect-kanban{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
.atlas-export-page .atlas-effect-timeline{border-left:2px solid var(--pa-fx-accent,#11765c);padding-left:17px}
.atlas-export-page .atlas-effect-timeline>.atlas-export-node:before{content:"";position:absolute;left:-23px;top:15px;width:9px;height:9px;border-radius:50%;background:var(--pa-fx-accent,#11765c);border:3px solid #fff}
.atlas-export-page .atlas-effect-accordion{padding:16px;background:#f1f7f4;border-radius:10px}
.atlas-export-page .atlas-activated{outline:2px solid var(--pa-fx-accent,#11765c);outline-offset:2px}
.atlas-workflow-control{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.atlas-workflow-trace{font-size:11px;color:#687d71;max-width:300px}
.atlas-workflow-trace summary{cursor:pointer}
.atlas-workflow-trace ol{margin:5px 0;padding-left:18px}
.atlas-workflow-trace li{display:flex;justify-content:space-between;gap:16px;margin:3px 0}
@keyframes atlas-workflow-pulse{0%,100%{outline-color:transparent}20%,75%{outline-color:#17a270}}
.atlas-workflow-highlight{outline:3px solid transparent;outline-offset:3px;animation:atlas-workflow-pulse 1.6s ease-in-out!important}
@media(prefers-reduced-motion:reduce){.atlas-workflow-highlight{animation:none!important;outline:2px solid #17a270!important}}
@media(max-width:650px){.atlas-export-page [data-atlas-layout="split"],.atlas-export-page [data-atlas-layout="grid"],.atlas-export-page .atlas-effect-bento,.atlas-export-page .atlas-effect-kanban{grid-template-columns:minmax(0,1fr)!important}.atlas-export-page [data-atlas-layout="stack"]{flex-direction:column!important}}
`;

function renderNode(node: CompositionNode, decoration: Record<string, StudioDecoration>, pageId: string, depth: number, routes: Record<string, string>): string {
  if (depth > 24) throw new Error('导出页面层级过深。');
  const props = node.props ?? {};
  const meta = decoration[`${pageId}:${node.id}`] ?? decoration[node.id] ?? {};
  const children = (node.children ?? []).map((child) => renderNode(child, decoration, pageId, depth + 1, routes)).join('\n');
  const currentEffect = meta.effect || '';
  const geometry = meta.geometry;
  const geometryStyle: Record<string, unknown> = { ...(geometry?.width ? { width: geometry.width, ...(geometry.mode === 'absolute' ? {} : { maxWidth: '100%' }) } : {}), ...(geometry?.height ? { height: geometry.height, minHeight: geometry.height } : {}), ...(geometry?.mode === 'absolute' ? { position: 'absolute', left: geometry.x ?? 0, top: geometry.y ?? 0 } : geometry?.x || geometry?.y ? { translate: `${geometry.x ?? 0}px ${geometry.y ?? 0}px` } : {}) };
  const geometryAttr = Object.keys(geometryStyle).length ? ` style={${json(geometryStyle)}}` : '';
  const currentPattern = ['default', 'bento', 'kanban', 'timeline', 'accordion'].includes(meta.pattern ?? '') ? meta.pattern : 'default';
  const clickAction = `handlePress(${json(node.id)},'toggle','','',${json(currentEffect)})`;
  const clickAttributes = node.kind === 'widget' && node.type !== 'button' && clickableEffects.has(currentEffect)
    ? ` role="button" tabIndex={0} aria-label={${json(nodeLabel(node))}} aria-pressed={Boolean(pressed[${json(node.id)}])} onClick={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,select,[role=combobox]')) return; ${clickAction}; }} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); ${clickAction}; } }}`
    : '';
  const wrapper = (inner: string, layoutType = '') => {
    const surface = `<div className={"atlas-export-node atlas-fx ${geometry?.mode === 'absolute' ? 'atlas-absolute ' : ''}" + (pressed[${json(node.id)}] ? 'atlas-active atlas-activated' : '')} data-effect={${json(currentEffect)}} data-studio-component=${json(node.id)}${layoutType ? ` data-atlas-layout=${json(layoutType)}` : ''}${geometryAttr}${clickAttributes} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>${inner}</div>`;
    return geometry?.mode === 'absolute' && depth > 0 ? `<>{absoluteLayer ? createPortal(${surface}, absoluteLayer) : null}</>` : surface;
  };
  if (node.kind === 'layout') {
    const gap = num(props.gap, 16);
    let inner: string;
    if (node.type === 'tabs') {
      const items = (node.children ?? []).map((child) => `{ key: ${json(child.id)}, label: ${json(child.label ?? nodeLabel(child))}, children: (${renderNode(child, decoration, pageId, depth + 1, routes)}) }`).join(',\n');
      inner = `<Tabs className="atlas-export-tabs" items={[${items}]}/>`;
    } else {
      const direction = props.direction === 'horizontal' ? 'row' : 'column';
      const style = node.type === 'grid' ? `{ display: 'grid', gridTemplateColumns: 'repeat(${Math.max(1, Math.min(6, num(props.columns, 2)))}, minmax(0,1fr))', gap: ${gap} }` : node.type === 'split' ? `{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(175px,${Math.max(175, Math.min(1000, num(props.secondarySize,280)))}px)', gap: ${gap} }` : `{ display:'flex', flexDirection:${json(direction)}, gap:${gap}, alignItems:${json(props.align === 'center' ? 'center' : 'stretch')} }`;
      inner = `<div className="atlas-export-stack atlas-effect-${currentPattern}" style={${style}}>${children}</div>`;
    }
    return wrapper(inner, node.type);
  }
  let inner: string;
  switch (node.type) {
    case 'panel': inner = `<div className="atlas-export-panel"><strong>{${json(stringValue(props.title, '卡片'))}}</strong>${props.description ? `<p className="atlas-muted">{${json(String(props.description))}}</p>` : ''}${children}</div>`; break;
    case 'text': {
      const value = meta.recordField ? `<StudioRecordFieldText field={${json(meta.recordField.field)}} fallback={${json(stringValue(props.text, '文字'))}}/>` : meta.api?.method === 'GET' && meta.api.url ? `<StudioRemoteValue binding={${json(meta.api)}} fallback={${json(stringValue(props.text, '文字'))}}/>` : `{${json(stringValue(props.text, '文字'))}}`;
      inner = props.variant === 'title' ? `<h2>${value}</h2>` : props.variant === 'subtitle' ? `<h3>${value}</h3>` : `<p className=${json(props.variant === 'secondary' ? 'atlas-muted' : '')}>${value}</p>`;
      break;
    }
    case 'metric': {
      const dataValue = meta.recordField ? `<StudioRecordFieldText field={${json(meta.recordField.field)}} fallback={${json(stringValue(props.value))}}/>` : meta.api?.method === 'GET' && meta.api.url ? `<StudioRemoteValue binding={${json(meta.api)}} fallback={${json(stringValue(props.value))}}/>` : `{${json(stringValue(props.value))}}`;
      inner = `<div className="atlas-export-metric"><small>{${json(stringValue(props.label, '指标'))}}</small><strong>${dataValue}{${json(stringValue(props.suffix))}}</strong></div>`; break;
    }
    case 'button': {
      const kind = buttonTypes.has(String(props.type)) ? String(props.type) : 'default';
      const route = meta.interaction === 'navigate' && meta.targetPage ? routes[meta.targetPage] ?? '' : '';
      if (meta.workflow?.steps.length) {
        inner = `<StudioWorkflowButton workflow={${json(meta.workflow)}} label={${json(stringValue(props.label, '执行流程'))}} buttonType={${json(kind)}} disabled={${Boolean(props.disabled)}} ${meta.recordSubmit ? `binding={${json(meta.recordSubmit)}}` : ''}/>`;
        break;
      }
      if (meta.recordSubmit) {
        inner = `<StudioRecordSave binding={${json(meta.recordSubmit)}} label={${json(stringValue(props.label, '保存修改'))}} buttonType={${json(kind)}} disabled={${Boolean(props.disabled)}}/>`;
        break;
      }
      inner = `<Button type=${json(kind)} disabled={${Boolean(props.disabled)}}${meta.interaction === 'toggle' ? ` aria-pressed={Boolean(pressed[${json(node.id)}])}` : ''} onClick={() => handlePress(${json(node.id)},${json(meta.interaction ?? 'none')},${json(meta.feedback || stringValue(props.label, '操作'))},${json(route)},${json(currentEffect)},${json(meta.api?.method === 'POST' ? meta.api : null)})}>{${json(stringValue(props.label, '操作'))}}</Button>`;
      break;
    }
    case 'input': inner = meta.recordField ? `<StudioRecordInput field={${json(meta.recordField.field)}} label={${json(stringValue(props.label, '输入框'))}} placeholder={${json(stringValue(props.placeholder))}} disabled={${Boolean(props.disabled)}}/>` : `<div className="atlas-export-field"><label>{${json(stringValue(props.label, '输入框'))}}</label><Input defaultValue={${json(stringValue(props.defaultValue))}} placeholder={${json(stringValue(props.placeholder))}} disabled={${Boolean(props.disabled)}}/></div>`; break;
    case 'select': {
      const options = Array.isArray(props.options) ? props.options.filter((row): row is { label: string; value: string } => Boolean(row && typeof row === 'object' && typeof (row as Record<string, unknown>).label === 'string' && typeof (row as Record<string, unknown>).value === 'string')) : [];
      inner = meta.recordField ? `<StudioRecordSelect field={${json(meta.recordField.field)}} label={${json(stringValue(props.label, '选择'))}} options={${json(options)}} disabled={${Boolean(props.disabled)}}/>` : `<div className="atlas-export-field"><label>{${json(stringValue(props.label, '选择'))}}</label><Select style={{width:'100%'}} options={${json(options)}} placeholder={${json(stringValue(props.placeholder))}} disabled={${Boolean(props.disabled)}}/></div>`;
      break;
    }
    case 'placeholder': inner = meta.widgetKind ? (meta.widgetKind === 'modal' || meta.widgetKind === 'drawer' || (meta.widgetKind === 'table' && typeof meta.widgetProps?.dataUrl === 'string' && Boolean(meta.widgetProps.dataUrl.trim())) ? `<StudioRecordWidget kind={${json(meta.widgetKind)}} props={${json(meta.widgetProps ?? {})}} workflowPages={${json(Object.keys(routes))}}/>` : `<WidgetPreview kind={${json(meta.widgetKind)}} props={${json(meta.widgetProps ?? {})}} live/>`) : meta.recordList ? `<StudioRecordList title={${json(stringValue(props.title, '记录列表'))}}/>` : `<div className="atlas-export-placeholder"><strong>{${json(stringValue(props.title, '待填充内容'))}}</strong><small>{${json(stringValue(props.description, '继续加入业务组件'))}}</small></div>`; break;
    default: inner = `<div className="atlas-export-placeholder"><strong>{${json(stringValue(props.title, '待填充内容'))}}</strong><small>{${json(stringValue(props.description, '继续加入业务组件'))}}</small></div>`;
  }
  return wrapper(inner);
}

/** Creates a standalone, editable React page. It is distinct from the governed Blueprint compiler output. */
export function pageRecordSource(document: StudioDocument, pageId: string): StudioRecordListBinding | null {
  const root = document.blueprint.pages.find((page) => page.id === pageId)?.composition;
  let found: StudioRecordListBinding | null = null;
  walkNodes(root, (node) => {
    if (found || node.type !== 'placeholder') return;
    found = (document.decorations[`${pageId}:${node.id}`] ?? document.decorations[node.id])?.recordList ?? null;
  });
  const resolved = resolveRecordList(found ?? undefined, document.dataSources);
  if (!resolved) return null;
  const { sourceId: _studioReference, ...standalone } = resolved;
  void _studioReference;
  return standalone;
}
export function generateReactPage(document: StudioDocument, pageId: string): string {
  const page = document.blueprint.pages.find((entry) => entry.id === pageId);
  if (!page?.composition) throw new Error('没有找到可导出的页面结构。');
  const vars = designCssVariables(document.design);
  const style = JSON.stringify({ ...vars, '--atlas-surface': document.design.surface === 'dark' ? '#14231e' : '#f5f8f6', '--atlas-panel': document.design.surface === 'dark' ? '#203b30' : '#ffffff', '--atlas-ink': document.design.surface === 'dark' ? '#eef8f0' : '#223b34' });
  const routes = Object.fromEntries(document.blueprint.pages.map((entry) => [entry.id, `#/${entry.id}`]));
  // Resolve shared-source references when generating standalone code. The original
  // Studio file retains references so that editing one source updates every binding.
  const exportDecorations: Record<string, StudioDecoration> = Object.fromEntries(Object.entries(document.decorations).map(([key, value]) => {
    if (value.widgetKind === 'modal' || value.widgetKind === 'drawer') {
      const props = value.widgetProps ?? {};
      const sourceId = typeof props.sourceId === 'string' ? props.sourceId : '';
      if (!sourceId) return [key, value];
      const source = document.dataSources.find((entry) => entry.id === sourceId);
      const { sourceId: _linked, ...rest } = props;
      void _linked;
      return [key, { ...value, widgetProps: { ...rest, submitUrl: source?.saveUrl ?? '' } }];
    }
    if (!value.recordSubmit) return [key, value];
    const resolved = resolveRecordSubmit(value.recordSubmit, document.dataSources);
    if (!resolved) return [key, value];
    const { sourceId: _studioReference, ...standalone } = resolved;
  void _studioReference;
    return [key, { ...value, recordSubmit: standalone }];
  }));
  const node = renderNode(page.composition, exportDecorations, pageId, 0, routes);
  const maxPositionY = Object.entries(exportDecorations).filter(([key, meta]) => key.startsWith(`${pageId}:`) && meta.geometry?.mode === 'absolute').reduce((height, [, meta]) => Math.max(height, (meta.geometry?.y ?? 0) + (meta.geometry?.height ?? 150) + 52), 0);
  const recordSource = pageRecordSource(document, pageId);
  const recordFields = findRecordFields(page.composition, pageId, document.decorations);
  const recordRules = findRecordRules(page.composition, pageId, document.decorations);
  return `/** Generated by Pattern Atlas Studio. React 19 + Ant Design 6. Modify freely. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Select, Tabs, message } from 'antd';
import { StudioRemoteValue, sendStudioPost, type StudioApiBinding } from ${json('../studio-api')};
import { StudioRecordProvider, StudioRecordWidget, StudioRecordList, StudioRecordFieldText, StudioRecordInput, StudioRecordSelect, StudioRecordSave, StudioWorkflowButton } from ${json('../studio-records')};
import { WidgetPreview } from ${json('../studio-widget-preview')};
import '../studio-effects.css';

export default function StudioPage() {
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [absoluteLayer, setAbsoluteLayer] = useState<HTMLDivElement | null>(null);
  const scrollTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      scrollTarget.current?.style.setProperty('--atlas-progress', total > 0 ? String(Math.min(100, Math.max(0, window.scrollY / total * 100))) + '%' : '100%');
    };
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const handlePress = (id: string, interaction: string, feedback: string, route: string, effect: string, api: StudioApiBinding | null = null) => {
    if (interaction === 'notice') void message.info(feedback);
    if (interaction === 'navigate' && route) window.location.hash = route;
    if (api?.method === 'POST') void sendStudioPost(api).then(() => message.success('请求成功')).catch((error: unknown) => message.error(error instanceof Error ? error.message : '请求失败'));
    if (interaction === 'toggle' || ['flip', 'morph-toggle', 'success-check'].includes(effect)) {
      setPressed((current) => ({ ...current, [id]: !current[id] }));
    }
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const surface = event.currentTarget;
    const effect = surface.dataset.effect;
    if (effect !== 'tilt' && effect !== 'spotlight') return;
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1)));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / (rect.height || 1)));
    surface.style.setProperty('--atlas-pointer-x', String(x * 100) + '%');
    surface.style.setProperty('--atlas-pointer-y', String(y * 100) + '%');
    if (effect === 'tilt') {
      surface.style.setProperty('--atlas-rotate-x', String((.5 - y) * 7) + 'deg');
      surface.style.setProperty('--atlas-rotate-y', String((x - .5) * 7) + 'deg');
    }
  };
  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.removeProperty('--atlas-rotate-x');
    event.currentTarget.style.removeProperty('--atlas-rotate-y');
  };
  return <StudioRecordProvider source={${json(recordSource)}} fields={${json(recordFields)}} rules={${json(recordRules)}}><div ref={scrollTarget} className=${json(`atlas-export-page ${document.design.motion !== 'system' ? 'atlas-no-motion' : ''}`)} style={{...(${style} as CSSProperties), minHeight:${Math.max(400, maxPositionY)} }}>
  <div ref={setAbsoluteLayer} className="atlas-page-absolute-layer"/>
  ${node}
  </div></StudioRecordProvider>;
}
`;
}

/** Standalone API helpers used only by the optional exported React app. Never embeds tokens. */
export const exportedApiRuntime = `import { useEffect, useState } from 'react';
export interface StudioApiBinding { method: 'GET' | 'POST'; url: string; responsePath?: string; body?: string; }
function valid(url: string): boolean {
  if (!url || /[\\\\\\s]/.test(url) || url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}
function pick(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, key) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !/^(?:[a-zA-Z_$][\\w$]*|\\d+)$/.test(key)) return undefined;
    return current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key) ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}
async function call(config: StudioApiBinding, signal?: AbortSignal): Promise<unknown> {
  if (!valid(config.url)) throw new Error('接口地址无效');
  let body: string | undefined;
  if (config.method === 'POST' && config.body?.trim()) body = JSON.stringify(JSON.parse(config.body));
  const response = await fetch(config.url, { method: config.method, credentials: 'same-origin', ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}), ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return pick((response.headers.get('content-type') || '').includes('json') ? await response.json() as unknown : await response.text(), config.responsePath);
}
export async function sendStudioPost(config: StudioApiBinding): Promise<void> { if (config.method !== 'POST') throw new Error('仅支持 POST 操作'); await call(config); }
export function StudioRemoteValue({ binding, fallback }: { binding: StudioApiBinding; fallback: string }) {
  const [state, setState] = useState<{ status: string; value: string }>({ status: 'loading', value: fallback });
  useEffect(() => {
    if (binding.method !== 'GET') return;
    const controller = new AbortController();
    setState({ status: 'loading', value: fallback });
    void call(binding, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ status: 'done', value: data == null ? '—' : typeof data === 'object' ? JSON.stringify(data).slice(0, 240) : String(data) });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', value: error instanceof Error ? error.message : '请求失败' });
    });
    return () => controller.abort();
  }, [binding.url, binding.method, binding.responsePath, fallback]);
  if (state.status === 'loading') return <>加载中…</>;
  if (state.status === 'error') return <span role="alert" title={state.value}>读取失败</span>;
  return <>{state.value}</>;
}
`;

export function generateStudioApp(document: StudioDocument): string {
  const pages = document.blueprint.pages.filter((entry) => entry.composition);
  if (!pages.length) throw new Error('项目没有可用页面。');
  const imports = pages.map((entry, index) => `import Page${index} from ${json(`./pages/${entry.id}`)};`).join('\n');
  const components = pages.map((entry, index) => `${json(entry.id)}: Page${index}`).join(', ');
  const items = [...(document.blueprint.navigation?.items ?? [])].sort((a,b) => a.order - b.order).filter((entry) => pages.some((page) => page.id === entry.target));
  const navigation = items.length ? items.map(({target,label}) => ({target,label})) : pages.map((entry) => ({target:entry.id,label:entry.title}));
  const shell = document.shell;
  return `/** Generated standalone multi-page entry. Use as your React application's App.tsx. */
import { useEffect, useState, type CSSProperties } from 'react';
${imports}
import './studio-effects.css';
const pageComponents = { ${components} };
const navItems = ${json(navigation)};
const homePage = ${json(pages[0]!.id)};
function currentPage() {
  let id = '';
  try { id = decodeURIComponent(window.location.hash.replace(/^#\\/?/, '')); } catch { return homePage; }
  return Object.prototype.hasOwnProperty.call(pageComponents, id) ? id as keyof typeof pageComponents : homePage;
}
export default function StudioApp() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const change = () => setPage(currentPage());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const View = pageComponents[page as keyof typeof pageComponents] ?? pageComponents[homePage as keyof typeof pageComponents];
  return <div className={${json(`atlas-app-shell atlas-app-${shell.navigation}`)}} style={{ '--app-sidebar-width': ${json(`${shell.sidebarWidth}px`)} } as CSSProperties}>
    <aside className="atlas-app-sidebar" aria-label="页面目录">
      <div className="atlas-app-brand">{${json(document.blueprint.project.title)}}</div>
      <nav className="atlas-app-nav">{navItems.map((item) => <a key={item.target} href={'#/' + item.target} className={page === item.target ? 'active' : ''}>{item.label}</a>)}</nav>
    </aside>
    <main className="atlas-app-main"><View/></main>
  </div>;
}
`;
}

function makeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, entry) => sum + entry.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const entry of parts) { result.set(entry, offset); offset += entry.length; }
  return result;
}
/** Uncompressed ZIP: works offline and does not require JSZip or additional npm dependencies. */
export function zipTextFiles(entries: Array<{ name: string; text: string }>): Blob {
  const encode = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[\w./-]+$/.test(entry.name) || entry.name.includes('..') || entry.name.startsWith('/')) throw new Error('ZIP 文件名称无效。');
    const name = encode.encode(entry.name);
    const data = encode.encode(entry.text);
    const crc = makeCrc32(data);
    const head = new Uint8Array(30 + name.length);
    const view = new DataView(head.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true); head.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true); dirView.setUint16(4, 20, true); dirView.setUint16(6, 20, true);
    dirView.setUint16(8, 0x0800, true); dirView.setUint32(16, crc, true); dirView.setUint32(20, data.length, true); dirView.setUint32(24, data.length, true);
    dirView.setUint16(28, name.length, true); dirView.setUint32(42, offset, true); dir.set(name, 46);
    local.push(head, data); central.push(dir);
    offset += head.length + data.length;
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  return new Blob([concat([...local, ...central, end]) as BlobPart], { type: 'application/zip' });
}
/** React/Vite output is a standalone app; no Foundation workspace runtime dependency. */
const STANDALONE_PROJECT_PACKAGE = {
  name: 'pattern-atlas-export', private: true, version: '1.0.0', type: 'module',
  scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
  dependencies: { antd: '^6.6.5', react: '^19.3.0', 'react-dom': '^19.3.0' },
  devDependencies: { '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', typescript: '~6.0.2', vite: '^8.3.2' }
};
export function projectExportFiles(document: StudioDocument): Array<{ name: string; text: string }> {
  const files: Array<{ name: string; text: string }> = [
    { name: 'package.json', text: JSON.stringify(STANDALONE_PROJECT_PACKAGE, null, 2) + '\n' },
    { name: 'index.html', text: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pattern Atlas Export</title></head><body><div id="root"></div><script type="module" src="/src.tsx"></script></body></html>\n' },
    { name: 'src.tsx', text: ["import { StrictMode } from 'react';", "import { createRoot } from 'react-dom/client';", "import 'antd/dist/reset.css';", "import StudioApp from './" + "StudioApp';", "const root = document.getElementById('root');", "if (!root) throw new Error('Missing #root');", "createRoot(root).render(<StrictMode><StudioApp/></StrictMode>);", ""].join('\n') },
    { name: 'vite-env.d.ts', text: '/// <reference types="vite/client" />\n' },
    { name: 'tsconfig.json', text: JSON.stringify({ compilerOptions: { target: 'ES2022', useDefineForClassFields: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'Bundler', allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true, noFallthroughCasesInSwitch: true }, include: ['vite-env.d.ts', 'src.tsx', 'StudioApp.tsx', 'studio-*.ts', 'studio-*.tsx', 'widgets.ts', 'pages/**/*.tsx'] }, null, 2) + '\n' },
    { name: 'foundation.project.json', text: `${JSON.stringify(document.blueprint, null, 2)}\n` },
    { name: 'atlas.studio.json', text: serializeStudioDocument(document) },
    { name: 'studio-effects.css', text: exportedPageStyles },
    { name: 'studio-api.tsx', text: exportedApiRuntime },
    { name: 'studio-records.tsx', text: exportedRecordRuntime },
    { name: 'studio-workflows.ts', text: exportedWorkflowRuntime },
    { name: 'studio-widget-preview.tsx', text: exportedWidgetPreview },
    { name: 'widgets.ts', text: exportedWidgetCatalog },
    { name: 'StudioApp.tsx', text: generateStudioApp(document) },
    { name: 'README.md', text: `# ${document.blueprint.project.title}

## 单独启动

解压后进入目录，执行 \`npm install\`、\`npm run build\` 和 \`npm run dev\`，浏览器访问 Vite 终端显示的地址。此项目仅依赖公开的 React/Ant Design/Vite 包。

本文件包中包含：

- **StudioApp.tsx**：多页面入口组件，支持左侧目录、顶部菜单或隐藏菜单；通过 #/页面ID 切换，无需额外路由依赖。将它作为目标 React 项目的 App。
- **pages/*.tsx + studio-effects.css**：React 19 / Ant Design 6 页面与特效源码。
- **studio-records.tsx**：记录列表 GET、分页与表单联动；表格组件由 **studio-widget-preview.tsx** 处理独立的服务端分页、搜索、筛选、排序、可选详情 GET、选中记录编辑 PATCH、二次确认的行级 DELETE。编辑提交后重新获取后端数据；删除成功后刷新列表与表格、清除被删除记录的选中上下文并在越页时回到有效页。删除失败时不伪造成功。
- **studio-widget-preview.tsx + widgets.ts**：与设计器同源的组件，包括文件上传/文件列表、异步任务/执行日志、折线/环形/热力图等。文件上传需配置真实 POST 接口；任务进度需配置 GET 状态接口；文件列表、日志、图表当前为静态或本地交互，不会自动接入后端。
- **studio-workflows.ts**：按钮工作流执行器；支持双分支判断、请求返回变量、组件事件、执行日志以及旧有确认、保存、刷新、导航步骤。
- **studio-api.tsx**：独立 GET 数值/文字读取和按钮 POST 请求示例。浏览器直接请求接口；项目级共享记录源则在导出时解析为实际地址。需后端允许 CORS 或部署同源 API，不支持在设计文件中安全存储凭据。请勿将 Token、密码或密钥放入设计文件或接口 URL。
- **atlas.studio.json**：可重新导入本设计器，恢复全部页面、导航设置、项目数据源目录、页面绝对坐标、数值尺寸、动效与 API 配置。
- **foundation.project.json**：原 Foundation 0.21.x Blueprint，用于原 Compiler 编译页面结构和导航。

### 远程表格接口示例

Studio 中选中「数据表格」，将 \`dataUrl\` 设为 \`/api/records\`、\`itemsPath\` 设为 \`data.items\`、\`totalPath\` 设为 \`data.total\`、\`idField\` 设为 \`id\`、\`tableColumns\` 设为两行 \`name|名称\` 与 \`status|状态\`。服务端 GET 返回 \`{"data":{"items":[{"id":"A-1","name":"Example","status":"active"}],"total":1}}\`。分页/搜索/筛选/排序按 \`page\`、\`pageSize\`、\`search\`、\`filterField\`、\`filter\`、\`sort\`、\`order\` 查询参数交给服务端实现。

可设置 \`detailUrl=/api/records/{id}\` 与 \`detailPath=data\`，详情 GET 的 JSON 应包含相同记录主键；编辑弹窗配置 \`edit-selected\`、\`PATCH\` 和带 \`{id}\` 的提交地址。可选的 \`deleteUrl=/api/records/{id}\` 启用「确认删除」；不配置则隐藏行删除操作。DELETE 请求无 body，后端应真实鉴权并返回适当 HTTP 状态，失败会保留原列表。主键经过 URL 编码。

请自行提供后端与授权策略；跨域 API 需配置 CORS/认证，浏览器默认使用同源凭据策略。**不要在导出文件里储存 API Token、密码或密钥。** 删除是否允许必须由服务器决定。当前没有多选批处理或部分失败恢复，不要将 UI 功能视为生产授权控制。


注意：绝对坐标以当前页面内容区左上角为原点，由 React portal 统一定位；响应式断点需自行检查组件是否溢出。原 Foundation Compiler 不读取 Studio 专有的尺寸偏移、交互、数据接口和特效元数据。要获得这部分行为，请使用此包的 React TSX/CSS 输出。不要只编译 Blueprint 后期待其包含所有动效与 API。
` },
  ];
  for (const page of document.blueprint.pages) if (page.composition) files.push({ name: `pages/${page.id}.tsx`, text: generateReactPage(document, page.id) });
  return files;
}
