import { describe, expect, it } from 'vitest';
import { parseRemoteTableColumns, parseRemoteTablePage, strongRecordEtag, normalizeWidgetProps, overlaySubmitUrl, mapOverlaySubmitPayload, classifyMutationHttpFailure, classifyMutationTransportFailure, parseMutationFieldErrors, classifyMutationException } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration, serializeStudioDocument, parseStudioFile } from '../studio/model';
import { newServerDemoSource, resolveTableWidgetProps, resolveOverlayWidgetProps, normalizeDataSources } from '../studio/data-sources';
import { buildStudioListUrl } from '../studio/source-query';
import { generateReactPage, projectExportFiles } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';
import { exportedRecordRuntime } from '../studio/record-exporter';

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
    expect(strongRecordEtag('"line\nfeed"')).toBeNull();
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
  it('shares one project-level table contract with fail-closed missing references and standalone export', () => {
    const server={...newServerDemoSource('shared-table'), listUrl:'/api/shared?scope=team'};
    const original=normalizeWidgetProps('table',{sourceId:'shared-table',dataUrl:'/stale-get',
      detailUrl:'/stale-detail/{id}',deleteUrl:'/stale-delete/{id}',tableColumns:'title|名称\\nstatus|状态'});
    const linked=resolveTableWidgetProps(original,normalizeDataSources([server]));
    expect(linked.dataUrl).toBe('/api/shared?scope=team');
    expect(linked.deleteUrl).toBe('/api/studio-records-mapped/{id}');
    expect(linked.itemsPath).toBe('data.entries');
    expect(linked.totalPath).toBe('data.count');
    expect(linked.sourceQueryMode).toBe('shared');
    expect(linked.fieldMappings).toEqual(server.fieldMappings);
    expect(buildStudioListUrl({ ...server,url:linked.dataUrl as string},2,'task',{filter:'ready',direction:'asc'}))
      .toContain('scope=team');
    expect(linked.filterParam).toBe('status');
    const missing=resolveTableWidgetProps(original,[]);
    expect(missing.dataUrl).toBe('');
    expect(missing.deleteUrl).toBe('');
    expect(missing.sourceError).toContain('不存在');
    const invalid=resolveTableWidgetProps(original,[{...server, paginationMode:'client'}]);
    expect(invalid.dataUrl).toBe('');
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    doc.dataSources=normalizeDataSources([server]);
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('table','sharedTable'),'inside');
    doc=setDecoration(doc,page.id+':sharedTable',{widgetKind:'table',widgetProps:original});
    const roundtrip=parseStudioFile(serializeStudioDocument(doc));
    expect(roundtrip.decorations[page.id+':sharedTable']?.widgetProps?.sourceId).toBe('shared-table');
    const pageCode=generateReactPage(roundtrip,page.id);
    expect(pageCode).toContain('/api/shared?scope=team');
    expect(pageCode).not.toContain('/stale-get');
    expect(pageCode).not.toContain('/stale-delete/{id}');
    expect(pageCode).toContain('fieldMappings');
    expect(pageCode).toContain('subject');
    expect(pageCode).toContain('saveField');
    const orphan=parseStudioFile(serializeStudioDocument({...doc,dataSources:[]}));
    const orphanCode=generateReactPage(orphan,page.id);
    expect(orphanCode).toContain('关联的数据源不存在或不支持服务端分页');
    expect(orphanCode).not.toContain('/api/shared?scope=team');
    expect(orphanCode).not.toContain('/stale-get');
    expect(orphanCode).not.toContain('/stale-delete/{id}');
  });
  it('resolves source-backed create/edit mutations and outbound alias mapping without stale fallback', () => {
    const source={...newServerDemoSource('shared-save'),
      createUrl:'/api/create-real',saveUrl:'/api/edit-real/{id}',
      fieldMappings:[{field:'name',responsePath:'alias.name',saveField:'subject'}]};
    const inputs=normalizeDataSources([source]);
    const create=resolveOverlayWidgetProps({sourceId:'shared-save', formMode:'create',submitUrl:'/stale-write'},inputs);
    expect(create.submitUrl).toBe('/api/create-real');
    expect(create.submitMethod).toBe('POST');
    expect(mapOverlaySubmitPayload({name:'张三'},create.saveFieldMappings)).toEqual({subject:'张三'});
    const edit=resolveOverlayWidgetProps({sourceId:'shared-save',formMode:'edit-selected',submitMethod:'POST',submitUrl:'/stale-edit'},inputs);
    expect(edit.submitUrl).toBe('/api/edit-real/{id}');
    expect(edit.submitMethod).toBe('PATCH');
    const missing=resolveOverlayWidgetProps({sourceId:'shared-save',submitUrl:'/stale-write'},[]);
    expect(missing.submitUrl).toBe('');
    expect(missing.sourceError).toContain('不存在');
    expect(resolveOverlayWidgetProps({sourceId:'shared-save',formMode:'edit-selected'},[{...source,saveUrl:'/api/not-templated'}]).submitUrl).toBe('');
    expect(resolveOverlayWidgetProps({formMode:'create',submitUrl:'/standalone'},[]).submitUrl).toBe('/standalone');
    expect(() => mapOverlaySubmitPayload({name:'a',subject:'b'},create.saveFieldMappings)).toThrow('映射冲突');
    let doc=createStudioDocument(); const page=doc.blueprint.pages[0]!;
    doc.dataSources=inputs;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('modal','writeModal'),'inside');
    doc=setDecoration(doc,page.id+':writeModal',{widgetKind:'modal',widgetProps:{
      title:'共享新增',formMode:'create',sourceId:'shared-save',formFields:'name|姓名|text|required',
      submitUrl:'/stale-write'}});
    const exported=generateReactPage(parseStudioFile(serializeStudioDocument(doc)),page.id);
    expect(exported).toContain('/api/create-real');
    expect(exported).toContain('subject');
    expect(exported).not.toContain('/stale-write');
  });
  it('normalizes mutation errors across POST/PATCH and table DELETE without unsafe retries', () => {
    for (const code of [401, 403]) {
      const result = classifyMutationHttpFailure(code);
      expect(result).toMatchObject({status:code,kind:'denied',refresh:false,safeToRetry:false});
    }
    for (const code of [404, 409, 412, 428]) {
      const result = classifyMutationHttpFailure(code);
      expect(result).toMatchObject({status:code,kind:'conflict',refresh:true,safeToRetry:false});
    }
    for (const code of [400, 422]) expect(classifyMutationHttpFailure(code))
      .toMatchObject({status:code,kind:'invalid',refresh:false,safeToRetry:false});
    for (const code of [500, 503]) expect(classifyMutationHttpFailure(code))
      .toMatchObject({status:code,kind:'uncertain',refresh:true,safeToRetry:false});
    expect(classifyMutationTransportFailure(true)).toMatchObject({kind:'uncertain',status:null,refresh:true,safeToRetry:false});
    expect(classifyMutationTransportFailure(false).message).toContain('网络异常');

    const mappings = [{field:'name',responsePath:'alias.name',saveField:'subject'}];
    const server = JSON.parse('{"errors":{"subject":["服务器要求更正姓名"],"__proto__":"unsafe","tooLong":"' + 'x'.repeat(300) + '"}}') as unknown;
    expect(parseMutationFieldErrors(server,mappings)).toEqual({name:'服务器要求更正姓名',tooLong:'x'.repeat(240)});
    expect(parseMutationFieldErrors({errors:{subject:{malicious:true}}},mappings)).toEqual({});
    expect(parseMutationFieldErrors({errors:{subject:'拒绝'}},[{field:'name',saveField:'subject'},{field:'other',saveField:'subject'}])).toEqual({});
    expect(parseMutationFieldErrors(null,mappings)).toEqual({});
  });
  it('keeps hosted and generated Record Providers on the same write failure taxonomy', () => {
    expect(classifyMutationException({status:422,message:'bad'})).toMatchObject({kind:'invalid',refresh:false,status:422});
    expect(classifyMutationException({status:403,message:'denied'})).toMatchObject({kind:'denied',refresh:false,status:403});
    expect(classifyMutationException({status:503,message:'server'})).toMatchObject({kind:'uncertain',refresh:true,status:503});
    expect(classifyMutationException(new TypeError('network down'))).toMatchObject({kind:'uncertain',refresh:true,status:null});
    expect(classifyMutationException(new Error('配置地址缺失'))).toMatchObject({kind:'failed',refresh:false,status:null});
    expect(exportedRecordRuntime).toContain('classifyMutationException');
    expect(exportedRecordRuntime).toContain('parseMutationFieldErrors');
    expect(exportedRecordRuntime).toContain('retainedDraft');
    expect(exportedRecordRuntime).toContain('status: response.status');
    expect(exportedRecordRuntime).toContain('raw.length <= 16384');
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
