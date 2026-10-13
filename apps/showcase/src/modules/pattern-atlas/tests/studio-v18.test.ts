import { describe, expect, it } from 'vitest';
import { parseChartSeries, studioWidgetKinds, normalizeWidgetProps } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration } from '../studio/model';
import { projectExportFiles } from '../studio/exporter';
import { exportedWidgetPreview, exportedWidgetCatalog } from '../studio/exported-widgets';

describe('Phase 18 overlays and measured curve', () => {
  it('registers functional overlay widgets', () => {
    expect(studioWidgetKinds.has('modal')).toBe(true);
    expect(studioWidgetKinds.has('drawer')).toBe(true);
    expect(studioWidgetKinds.has('popconfirm')).toBe(true);
    expect(normalizeWidgetProps('drawer', { width: 999 }).width).toBe(800);
  });
  it('preserves negative and >100 signed measurements for multiple series', () => {
    expect(parseChartSeries('测量:-2,0,120;参考:10,20,30', '')).toEqual([
      { name:'测量', values:[-2,0,120] }, { name:'参考', values:[10,20,30] }
    ]);
    expect(parseChartSeries('', '-30,0,320')).toEqual([{ name:'数值', values:[-30,0,320] }]);
  });
  it('exports the same React preview implementation and configured modal', () => {
    let doc=createStudioDocument();
    const page=doc.blueprint.pages[0]!;
    page.composition=insertNode(page.composition!, page.composition!.id, createNode('modal','dialog18'),'inside');
    doc=setDecoration(doc, page.id + ':dialog18', {widgetKind:'modal',widgetProps:{title:'审核',triggerText:'打开'}});
    const files=projectExportFiles(doc);
    expect(files.find((item)=>item.name==='widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(files.find((item)=>item.name==='studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((item)=>item.name==='pages/'+page.id+'.tsx')?.text).toContain('kind={"modal"}');
  });
});
