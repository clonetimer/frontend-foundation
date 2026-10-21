import { describe, expect, it } from 'vitest';
import { expandableLayerIds, searchStudioLayers, selectedLayerPath, studioUndoShortcut } from '../studio/studio-layer-navigation';
import type { CompositionNode } from '../bridge';

const root: CompositionNode = {
  id: 'pageRoot', kind: 'layout', type: 'stack', props: {}, children: [
    { id: 'details', kind: 'widget', type: 'panel', props: { title: '设备详情' }, children: [
      { id: 'healthMetric', kind: 'widget', type: 'metric', props: { label: '健康度' } },
      { id: 'temperatureChart', kind: 'widget', type: 'placeholder', props: { title: '温度曲线' } }
    ] },
    { id: 'other', kind: 'widget', type: 'panel', props: { title: '其他设置' } }
  ]
};
const label = (node: CompositionNode) => String(node.props?.title ?? node.props?.label ?? node.id);

describe('Studio editor navigation ergonomics · no serialized schema changes', () => {
  it('keeps only matching components and ancestors in searches, without showing siblings', () => {
    const result = searchStudioLayers(root, '温度', label);
    expect([...result.matchedIds]).toEqual(['temperatureChart']);
    expect([...result.visibleIds].sort()).toEqual(['details', 'pageRoot', 'temperatureChart']);
    expect(result.visibleIds.has('other')).toBe(false);
    expect(result.visibleIds.has('healthMetric')).toBe(false);
  });
  it('searches by visible name, type and stable id, ignoring case and surrounding spaces', () => {
    expect(searchStudioLayers(root, '  HEALTHmetric  ', label).matchedIds.has('healthMetric')).toBe(true);
    expect(searchStudioLayers(root, '  METRIC  ', label).matchedIds.has('healthMetric')).toBe(true);
    expect(searchStudioLayers(root, '不存在', label).visibleIds.size).toBe(0);
    expect(searchStudioLayers(root, '   ', label).matchedIds.size).toBe(0);
  });
  it('returns stable foldable nodes and a root-to-leaf selection path', () => {
    expect(expandableLayerIds(root)).toEqual(['pageRoot', 'details']);
    expect(selectedLayerPath(root, 'temperatureChart').map((node) => node.id)).toEqual(['pageRoot', 'details', 'temperatureChart']);
    expect(selectedLayerPath(root, 'missing')).toEqual([]);
    expect(selectedLayerPath(root, 'pageRoot').map((node) => node.id)).toEqual(['pageRoot']);
  });
  it('does not steal native undo when typing or using an actual application preview', () => {
    const shortcut = (key: string, opts: Partial<Parameters<typeof studioUndoShortcut>[0]> = {}) => studioUndoShortcut({
      key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, editableTarget: false, editingDisabled: false, ...opts
    });
    expect(shortcut('z')).toBe('undo');
    expect(shortcut('Z', { shiftKey: true })).toBe('redo');
    expect(shortcut('y')).toBe('redo');
    expect(shortcut('z', { ctrlKey: false, metaKey: true })).toBe('undo');
    expect(shortcut('z', { ctrlKey: false, metaKey: false })).toBeNull();
    expect(shortcut('z', { editableTarget: true })).toBeNull();
    expect(shortcut('z', { editingDisabled: true })).toBeNull();
    expect(shortcut('z', { altKey: true })).toBeNull();
    expect(shortcut('y', { shiftKey: true })).toBeNull();
  });
});
