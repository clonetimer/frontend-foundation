import { describe, expect, it } from 'vitest';
import { normalizeWidgetProps, overlaySubmitUrl } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration, parseStudioFile, serializeStudioDocument } from '../studio/model';
import { generateReactPage, projectExportFiles } from '../studio/exporter';
import { newDemoSource } from '../studio/data-sources';
import { exportedWidgetPreview, exportedWidgetCatalog } from '../studio/exported-widgets';

describe('Phase 21-B selected-record business overlay', () => {
  it('accepts only a single {id} in edit URLs and encodes the entire record ID', () => {
    expect(overlaySubmitUrl('/api/records/{id}', 'edit-selected', 'R/1 ?')).toBe('/api/records/R%2F1%20%3F');
    expect(overlaySubmitUrl('/api/records/{id}', 'edit-selected', '')).toBeUndefined();
    expect(overlaySubmitUrl('/api/records', 'edit-selected', 'R-1')).toBeUndefined();
    expect(overlaySubmitUrl('/api/{id}/{id}', 'edit-selected', 'R-1')).toBeUndefined();
    expect(overlaySubmitUrl('javascript:alert(1)', 'edit-selected', 'R-1')).toBeUndefined();
    expect(overlaySubmitUrl('//evil.test/{id}', 'edit-selected', 'R-1')).toBeUndefined();
    expect(overlaySubmitUrl('/api/{id}', 'create')).toBeUndefined();
  });
  it('normalizes form operation and source references without arbitrary methods', () => {
    const props = normalizeWidgetProps('modal', {
      formMode:'edit-selected',submitMethod:'PATCH',sourceId:'source-one',formFields:'name|姓名|text|required',submitUrl:'/api/{id}'
    });
    expect(props).toMatchObject({formMode:'edit-selected',submitMethod:'PATCH',sourceId:'source-one'});
    expect(normalizeWidgetProps('modal',{formMode:'DROP',submitMethod:'DELETE',sourceId:'../../../data'}))
      .toMatchObject({formMode:'create',submitMethod:'POST',sourceId:''});
  });
  it('persists editable shared-source binding but freezes source URL into exported page', () => {
    let doc = createStudioDocument();
    doc.dataSources=[{...newDemoSource('form-source'),saveUrl:'/api/records/{id}'}];
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('modal','edit-modal'),'inside');
    doc=setDecoration(doc,page.id+':edit-modal', {widgetKind:'modal',widgetProps:normalizeWidgetProps('modal',{
      title:'编辑记录',formMode:'edit-selected',submitMethod:'PATCH',sourceId:'form-source',formFields:'name|姓名|text|required'
    })});
    const restored=parseStudioFile(serializeStudioDocument(doc));
    expect(restored.decorations[page.id+':edit-modal']?.widgetProps?.sourceId).toBe('form-source');
    const pageSource=generateReactPage(restored,page.id);
    expect(pageSource).toContain('StudioRecordWidget');
    expect(pageSource).toContain('/api/records/{id}');
    expect(pageSource).not.toContain('sourceId');
    const zip=projectExportFiles(restored);
    expect(zip.find((f)=>f.name==='widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(zip.find((f)=>f.name==='studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(zip.find((f)=>f.name==='studio-records.tsx')?.text).toContain('StudioRecordWidget');
  });
});
