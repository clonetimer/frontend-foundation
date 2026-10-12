import { describe, expect, it } from 'vitest';
import { parseOverlayFormFields, validateOverlayForm, normalizeWidgetProps } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration, serializeStudioDocument, parseStudioFile } from '../studio/model';
import { projectExportFiles } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';

describe('Phase 21 · bounded overlay business forms', () => {
  const schema = 'name|姓名|text|required\nemail|邮箱|email|required\namount|金额|number|optional';
  it('parses typed fields and rejects prototype pollution, duplication and oversized forms', () => {
    const fields = parseOverlayFormFields(schema);
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.type)).toEqual(['text','email','number']);
    expect(parseOverlayFormFields('__proto__|非法|text|required')).toEqual([]);
    expect(parseOverlayFormFields('name|名称|text|required\nname|重复|text|required')).toEqual([]);
    expect(parseOverlayFormFields('name|名称|password|required')).toEqual([]);
    expect(parseOverlayFormFields('name|名称|text|maybe')).toEqual([]);
    expect(parseOverlayFormFields(Array.from({length:9}, (_,n) => 'field' + n + '|字段|text|optional').join('\n'))).toEqual([]);
  });
  it('validates required fields, email, numbers and emits safe JSON payloads', () => {
    const fields = parseOverlayFormFields(schema);
    expect(validateOverlayForm(fields, {}).errors).toEqual({ name:'此项必填', email:'此项必填' });
    expect(validateOverlayForm(fields, {name:'张三', email:'not-email'}).errors.email).toContain('邮箱格式');
    expect(validateOverlayForm(fields, {name:'张三', email:'valid@example.org', amount:'1e999'}).errors.amount).toContain('数字');
    const saved = validateOverlayForm(fields, {name:' 张三 ', email:'valid@example.org', amount:'-12.5'});
    expect(saved.errors).toEqual({});
    expect(saved.payload).toEqual({name:'张三', email:'valid@example.org', amount:-12.5});
  });
  it('keeps modal/drawer declaration and exact executable preview through export', () => {
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('modal','modal21'),'inside');
    page.composition=insertNode(page.composition!,page.composition!.id,createNode('drawer','drawer21'),'inside');
    for(const id of ['modal21','drawer21']) doc=setDecoration(doc,page.id+':'+id,{
      widgetKind:id==='modal21'?'modal':'drawer',
      widgetProps: normalizeWidgetProps(id==='modal21'?'modal':'drawer',{ title:'新增', formFields:schema, submitUrl:'/api/records',okText:'保存' })
    });
    const parsed=parseStudioFile(serializeStudioDocument(doc));
    expect(parsed.decorations[page.id+':modal21']?.widgetProps?.formFields).toBe(schema);
    expect(parsed.decorations[page.id+':drawer21']?.widgetProps?.submitUrl).toBe('/api/records');
    const files=projectExportFiles(parsed);
    expect(files.find((file)=>file.name==='widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(files.find((file)=>file.name==='studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((file)=>file.name==='pages/'+page.id+'.tsx')?.text).toContain('formFields');
    expect(files.find((file)=>file.name==='studio-records.tsx')?.text).toContain('atlas:records-refresh');
    expect(exportedWidgetPreview).toContain('validateOverlayForm');
  });
});
