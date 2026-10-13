import { describe, expect, it, vi } from 'vitest';
import { normalizeWidgetProps } from '../studio/widgets';
import { parseOverlayFollowup } from '../studio/WidgetPreview';
import { runStudioWorkflow } from '../studio/studio-workflows';
import { createStudioDocument, createNode, insertNode, setDecoration, serializeStudioDocument, parseStudioFile } from '../studio/model';
import { generateReactPage, projectExportFiles } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';

const workflow = { steps:[
  { id:'choose', type:'branch', source:'draft.name', operator:'exists', expected:'',
    onTrue:[{id:'found',type:'notify',text:'saved {{draft.name}}'}],
    onFalse:[{id:'missing',type:'notify',text:'empty'}] },
  {id:'refresh',type:'refresh-records'}
] };

describe('Phase 21-C · overlay post-submit workflows', () => {
  it('supports a bounded conditional branch and the same execution engine as buttons', async () => {
    const definition=parseOverlayFollowup(JSON.stringify(workflow), ['overview']);
    expect(definition?.steps).toHaveLength(2);
    const notify=vi.fn(), refreshRecords=vi.fn();
    await runStudioWorkflow(definition!, {
      confirm:async()=>true,notify,navigate:vi.fn(),saveRecord:async()=>{},refreshRecords,
      draft:{name:'卫星'}
    });
    expect(notify).toHaveBeenCalledWith('saved 卫星');
    expect(refreshRecords).toHaveBeenCalledOnce();
  });
  it('rejects duplicate saving, malformed branches and oversized configurations', () => {
    expect(parseOverlayFollowup('', ['overview'])).toBeUndefined();
    expect(() => parseOverlayFollowup('{"steps":[{"id":"again","type":"save-record"}]}',['overview'])).toThrow();
    expect(() => parseOverlayFollowup(JSON.stringify({steps:[{id:'branch',type:'branch',source:'selectedId',operator:'exists',expected:'',onTrue:[{id:'again',type:'save-record'}],onFalse:[]}]}),['overview'])).toThrow();
    expect(() => parseOverlayFollowup(JSON.stringify({steps:[{id:'branch',type:'branch',source:'selectedId',operator:'exists',expected:'',onTrue:[{id:'x',type:'invalid'}],onFalse:[]}]}),['overview'])).toThrow();
    expect(() => parseOverlayFollowup('{bad JSON',['overview'])).toThrow();
    expect(() => parseOverlayFollowup(' '.repeat(5001),['overview'])).toThrow();
  });
  it('roundtrips success and failure handlers through a standalone export with exact source mirrors', () => {
    const successWorkflow=JSON.stringify(workflow);
    const failureWorkflow=JSON.stringify({steps:[{id:'fail',type:'notify',text:'提交失败'}]});
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('modal','form21c'),'inside');
    doc=setDecoration(doc,page.id+':form21c',{widgetKind:'modal',widgetProps:normalizeWidgetProps('modal',{
      formFields:'name|姓名|text|required',submitUrl:'/api/submit',successWorkflow,failureWorkflow
    })});
    const restored=parseStudioFile(serializeStudioDocument(doc));
    const saved=restored.decorations[page.id+':form21c']?.widgetProps;
    expect(saved?.successWorkflow).toBe(successWorkflow);
    expect(saved?.failureWorkflow).toBe(failureWorkflow);
    const compiled=generateReactPage(restored,page.id);
    expect(compiled).toContain('workflowPages');
    expect(compiled).toContain('successWorkflow');
    const files=projectExportFiles(restored);
    expect(files.find((file)=>file.name==='studio-workflows.ts')?.text).toContain('runStudioWorkflow');
    expect(files.find((file)=>file.name==='studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((file)=>file.name==='widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(files.find((file)=>file.name==='studio-records.tsx')?.text).toContain('workflowPages');
  });
});
