import { buildProjectBlueprint } from '../builder/project-blueprint';
import type { CompositionNode } from '../bridge';
import { setDecoration, type StudioDocument } from './model';
import { newDemoSource } from './data-sources';

/** A complete two-panel demo, generated as standard Foundation composition nodes. */
export function addRecordEditorExample(document: StudioDocument): { document: StudioDocument; pageId: string } {
  let pageId = 'record-editor';
  let count = 2;
  while (document.blueprint.pages.some((page) => page.id === pageId)) pageId = `record-editor-${count++}`;
  const blueprint = buildProjectBlueprint({
    mode: 'existing', projectId: document.blueprint.project.id, projectTitle: document.blueprint.project.title,
    pageId, pageTitle: '记录编辑', template: 'blank', existingBlueprint: document.blueprint
  });
  const page = blueprint.pages.find((entry) => entry.id === pageId)!;
  const left: CompositionNode = { id: 'recordListCard', kind: 'widget', type: 'panel', props: { title: '记录列表' }, children: [
    { id: 'recordList', kind: 'widget', type: 'placeholder', props: { title: '选择一条记录', description: '绑定 API 后显示真实记录' } }
  ] };
  const right: CompositionNode = { id: 'recordDetailCard', kind: 'widget', type: 'panel', props: { title: '编辑记录' }, children: [
    { id: 'recordHeading', kind: 'widget', type: 'text', props: { text: '记录详情', variant: 'subtitle' } },
    { id: 'recordTitle', kind: 'widget', type: 'input', props: { label: '标题', placeholder: '输入记录标题' } },
    { id: 'recordStatus', kind: 'widget', type: 'select', props: { label: '状态', options: [
      { label: '就绪', value: 'ready' }, { label: '草稿', value: 'draft' }, { label: '归档', value: 'archived' }
    ] } },
    { id: 'recordSave', kind: 'widget', type: 'button', props: { label: '保存修改', type: 'primary' } }
  ] };
  page.composition = { id: 'recordEditorRoot', kind: 'layout', type: 'grid', props: { columns: 2, gap: 16 }, children: [left, right] };
  let next = { ...document, blueprint };
  next = setDecoration(next, `${pageId}:recordList`, { recordList: { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title' } });
  next = setDecoration(next, `${pageId}:recordHeading`, { recordField: { field: 'title' } });
  next = setDecoration(next, `${pageId}:recordTitle`, { recordField: { field: 'title' } });
  next = setDecoration(next, `${pageId}:recordStatus`, { recordField: { field: 'status' } });
  next = setDecoration(next, `${pageId}:recordSave`, { recordSubmit: { url: '/api/studio-records', includeId: true } });
  return { document: next, pageId };
}

/** Phase 11 opt-in template: a shared record source with a distinct detail endpoint.
 * Keeps the older record-editor example unchanged for imported projects and tests.
 */
export function addLinkedRecordExample(document: StudioDocument): { document: StudioDocument; pageId: string; sourceId: string } {
  if (document.dataSources.length >= 25) throw new Error('项目数据源已达到 25 个上限，请复用现有数据源。');
  const { document: initial, pageId } = addRecordEditorExample(document);
  let sourceId = 'studio-records';
  let counter = 2;
  while (initial.dataSources.some((entry) => entry.id === sourceId)) sourceId = `studio-records-${counter++}`;
  const enriched: StudioDocument = { ...initial, dataSources: [...initial.dataSources, newDemoSource(sourceId)] };
  const page = enriched.blueprint.pages.find((entry) => entry.id === pageId);
  const detailCard = page?.composition?.children?.[1];
  if (!detailCard) throw new Error('记录编辑布局不可用。');
  detailCard.children ??= [];
  detailCard.children.splice(detailCard.children.length - 1, 0, {
    id: 'recordOwner', kind: 'widget', type: 'input', props: { label: '负责人', placeholder: '从详情接口加载' }
  });
  let next = setDecoration(enriched, `${pageId}:recordOwner`, { recordField: { field: 'owner' } });
  next = setDecoration(next, `${pageId}:recordList`, { recordList: { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title', sourceId } });
  next = setDecoration(next, `${pageId}:recordSave`, { recordSubmit: { url: '/api/studio-records', includeId: true, sourceId } });
  next = setDecoration(next, `${pageId}:recordSave`, { workflow: { steps: [{ id:'step-1', type:'confirm', text:'确定保存这条记录？' }, { id:'step-2', type:'save-record' }, { id:'step-3', type:'notify', text:'保存成功，列表已更新' }] } });
  return { document: next, pageId, sourceId };
}
