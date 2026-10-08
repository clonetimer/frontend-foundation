import { describe, expect, it } from 'vitest';
import { listFoundationUiCatalog } from '../src';

describe('Foundation UI composition catalog', () => {
  it('exposes stable planner-facing pattern and block ids', () => {
    expect(listFoundationUiCatalog('pattern').map((entry) => entry.id)).toEqual([
      'dashboard', 'master-detail', 'split-pane', 'workspace'
    ]);
    expect(listFoundationUiCatalog('block').map((entry) => entry.id)).toEqual([
      'panel', 'metric', 'metric-grid'
    ]);
  });
});
