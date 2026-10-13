import { describe, expect, it } from 'vitest';
import { parseRemoteChartDataset, normalizeWidgetProps, safeWidgetImageUrl } from '../studio/widgets';
import { createStudioDocument, createNode, insertNode, setDecoration, serializeStudioDocument, parseStudioFile } from '../studio/model';
import { projectExportFiles } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';

describe('Phase 20 · live chart binding and portable export', () => {
  const remote = { items: ['一月', '二月'], series: [
    { name: '当前', values: [-25, 250] },
    { name: '目标', values: [0, 120] }
  ] };
  it('accepts bounded, signed and multi-series remote datasets', () => {
    expect(parseRemoteChartDataset(remote)).toEqual(remote);
    expect(parseRemoteChartDataset({ ...remote, items: ['一月'] })).toBeNull();
    expect(parseRemoteChartDataset({ ...remote, series: [{name:'X', values:[1, NaN]}] })).toBeNull();
    expect(parseRemoteChartDataset({ ...remote, series: [{name:'X', values:[1, Infinity]}] })).toBeNull();
    expect(parseRemoteChartDataset({ ...remote, series: [{name:'X', values:[1, 1e13]}] })).toBeNull();
    expect(parseRemoteChartDataset({ ...remote, series: Array.from({length:7}, () => remote.series[0]) })).toBeNull();
    expect(parseRemoteChartDataset({ ...remote, items: ['ok', '__proto__'], series:[{name:'x',values:[1,2]}] })).not.toBeNull();
    expect(parseRemoteChartDataset(null)).toBeNull();
    expect(parseRemoteChartDataset({ series:[] })).toBeNull();
  });
  it('clamps polling, rejects unsafe URLs and preserves disabled polling', () => {
    expect(normalizeWidgetProps('line-chart', { refreshMs:0, dataUrl:'/api/charts' }).refreshMs).toBe(0);
    expect(normalizeWidgetProps('line-chart', { refreshMs:2000 }).refreshMs).toBe(5000);
    expect(normalizeWidgetProps('line-chart', { refreshMs:999999 }).refreshMs).toBe(60000);
    expect(safeWidgetImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeWidgetImageUrl('//example.org/chart')).toBeUndefined();
  });
  it('retains API-bound chart settings across serialization and the standalone mirror', () => {
    let document = createStudioDocument();
    const page = document.blueprint.pages[0]!;
    page.composition = insertNode(page.composition!, page.composition!.id, createNode('line-chart','remoteTrend20'), 'inside');
    document = setDecoration(document, page.id + ':remoteTrend20', {
      widgetKind: 'line-chart', widgetProps: normalizeWidgetProps('line-chart',
        { title: '遥测曲线', dataUrl: '/api/chart', dataPath:'data', refreshMs:5000, unit:'℃' })
    });
    const restored = parseStudioFile(serializeStudioDocument(document));
    const config = restored.decorations[page.id + ':remoteTrend20']?.widgetProps;
    expect(config?.dataUrl).toBe('/api/chart');
    expect(config?.dataPath).toBe('data');
    expect(config?.refreshMs).toBe(5000);
    const files = projectExportFiles(restored);
    expect(files.find((file) => file.name === 'widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(files.find((file) => file.name === 'studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((file) => file.name === 'pages/' + page.id + '.tsx')?.text).toContain('dataUrl');
    expect(exportedWidgetPreview).toContain('RemoteLineWidget');
  });
});
