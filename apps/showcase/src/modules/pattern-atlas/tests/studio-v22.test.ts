import { describe, expect, it } from 'vitest';
import { parseRemoteTableColumns, parseRemoteTablePage, strongRecordEtag, normalizeWidgetProps, overlaySubmitUrl } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration, serializeStudioDocument, parseStudioFile } from '../studio/model';
import { generateReactPage, projectExportFiles } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';

describe('Phase 22 · remote business tables', () => {
  const columns = parseRemoteTableColumns('name|名称\nstatus|状态\namount|数量');
  it('validates declared columns and rejects unsafe or duplicate keys', () => {
    expect(columns).toHaveLength(3);
    expect(parseRemoteTableColumns('constructor|非法')).toEqual([]);
    expect(parseRemoteTableColumns('name|一\nname|重复')).toEqual([]);
    expect(parseRemoteTableColumns('bad.path|越界')).toEqual([]);
    expect(parseRemoteTableColumns('name|合法\nstatus|状态')).toHaveLength(2);
    expect(parseRemoteTableColumns(Array.from({length:9},(_,n)=>'k'+n+'|列').join('\n'))).toEqual([]);
  });
  it('requires bounded, finite, uniquely keyed server pages', () => {
    const input = {items:[{id:'R/1 ?',name:'记录',status:'进行中',amount:-9}],total:27};
    expect(parseRemoteTablePage(input,'id',columns)).toEqual({
      items:[{key:'R/1 ?', id:'R/1 ?',name:'记录',status:'进行中',amount:-9}],total:27
    });
    expect(parseRemoteTablePage({...input,total:'27'},'id',columns)).toBeNull();
    expect(parseRemoteTablePage({...input,total:-1},'id',columns)).toBeNull();
    expect(parseRemoteTablePage({items:[input.items[0], input.items[0]],total:2},'id',columns)).toBeNull();
    expect(parseRemoteTablePage({items:[{id:'id',name:{__proto__:'bad'},status:'ok'}],total:1},'id',columns)).toBeNull();
    expect(parseRemoteTablePage({items:[{id:'id',name:'ok',amount:Infinity}],total:1},'id',columns)).toBeNull();
    expect(parseRemoteTablePage(input,'__proto__',columns)).toBeNull();
    expect(parseRemoteTablePage({items:Array.from({length:101},(_,n)=>({id:String(n)})),total:101},'id',columns)).toBeNull();
  });
  it('keeps strong ETag conditional DELETE metadata separate from displayed columns and identity', () => {
    const input = {items:[{id:'X-1',name:'任务',status:'进行中',etag:'"rev-2"'}],total:1};
    expect(strongRecordEtag('"rev-2"')).toBe('"rev-2"');
    expect(strongRecordEtag('W/"weak"')).toBeNull();
    expect(strongRecordEtag('not-quoted')).toBeNull();
    expect(strongRecordEtag('"line\\nfeed"')).toBeNull();
    expect(strongRecordEtag(null)).toBeNull();
    expect(parseRemoteTablePage(input,'id',columns,'etag')).toEqual({items:[{
      key:'X-1',id:'X-1',name:'任务',status:'进行中',amount:null,etag:'"rev-2"'
    }],total:1});
    expect(parseRemoteTablePage(input,'id',columns,'key')).toBeNull();
    expect(parseRemoteTablePage(input,'id',columns,'id')).toBeNull();
    expect(parseRemoteTablePage(input,'id',columns,'__proto__')).toBeNull();
    expect(parseRemoteTablePage({items:[{...input.items[0],etag:'bad'}],total:1},'id',columns,'etag')?.items[0]?.etag).toBeNull();
  });
  it('can export a table-only page without a record-list source while retaining editable row context', () => {
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('table','tableOnly'),'inside');
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('modal','editOnly'),'inside');
    doc=setDecoration(doc,page.id+':tableOnly',{widgetKind:'table',widgetProps:normalizeWidgetProps('table',{
      dataUrl:'/api/table',detailUrl:'/api/records/{id}',detailPath:'data',deleteUrl:'/api/delete/{id}',idField:'id',
      tableColumns:'name|姓名\nstatus|状态',pageSize:2
    })});
    doc=setDecoration(doc,page.id+':editOnly',{widgetKind:'modal',widgetProps:normalizeWidgetProps('modal',{
      title:'编辑',formMode:'edit-selected',formFields:'name|姓名|text|required',submitUrl:'/api/save/{id}'
    })});
    const restored=parseStudioFile(serializeStudioDocument(doc));
    const compiled=generateReactPage(restored,page.id);
    expect(compiled).toContain('StudioRecordProvider source={null}');
    expect(compiled).toContain('StudioRecordWidget kind={"table"}');
    expect(compiled).toContain('StudioRecordWidget kind={"modal"}');
    expect(compiled).toContain('/api/records/{id}');
    expect(compiled).toContain('/api/delete/{id}');
    const files=projectExportFiles(restored);
    const runtime=files.find(f=>f.name==='studio-records.tsx')?.text ?? '';
    expect(runtime).toContain('chooseTable: setTableSelection');
    expect(runtime).toContain('state.tableSelection ??');
    expect(runtime).toContain('setTableSelection(null)');
  });
  it('roundtrips remote configuration, bounded page size and exact exported implementation', () => {
    const remote={dataUrl:'/api/table',itemsPath:'data.items',totalPath:'data.total',detailUrl:'/api/record/{id}',detailPath:'data',deleteUrl:'/api/delete/{id}',deleteEtagField:'etag',idField:'id',tableColumns:'name|名称\nstatus|状态',filterField:'status',filterValues:'进行中,已完成',sortField:'name',pageSize:500};
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('table','remoteTable22'),'inside');
    doc=setDecoration(doc,page.id+':remoteTable22',{widgetKind:'table',widgetProps:normalizeWidgetProps('table',remote)});
    const restored=parseStudioFile(serializeStudioDocument(doc));
    const props=restored.decorations[page.id+':remoteTable22']?.widgetProps;
    expect(props?.dataUrl).toBe('/api/table');
    expect(props?.deleteUrl).toBe('/api/delete/{id}');
    expect(props?.deleteEtagField).toBe('etag');
    expect(props?.pageSize).toBe(20);
    expect(props?.tableColumns).toContain('status|状态');
    const output=generateReactPage(restored,page.id);
    expect(output).toContain('StudioRecordWidget');
    expect(output).toContain('/api/table');
    const files=projectExportFiles(restored);
    expect(files.find((item)=>item.name==='studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((item)=>item.name==='widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(files.find((item)=>item.name==='studio-records.tsx')?.text).toContain('onRecordSelect');
    expect(files.find((item)=>item.name==='studio-widget-preview.tsx')?.text).toContain('确认删除记录？');
  });
  it('keeps deletion opt-in and rejects invalid DELETE URL templates', () => {
    expect(normalizeWidgetProps('table', {}).deleteUrl).toBe('');
    expect(normalizeWidgetProps('table', {}).deleteEtagField).toBe('');
    expect(overlaySubmitUrl('/api/delete/{id}', 'edit-selected', 'R/1 ?')).toBe('/api/delete/R%2F1%20%3F');
    expect(overlaySubmitUrl('/api/delete/{id}/{id}', 'edit-selected', '1')).toBeUndefined();
    expect(overlaySubmitUrl('javascript:alert({id})', 'edit-selected', '1')).toBeUndefined();
    expect(overlaySubmitUrl('//attacker.invalid/api/{id}', 'edit-selected', '1')).toBeUndefined();
  });
});
