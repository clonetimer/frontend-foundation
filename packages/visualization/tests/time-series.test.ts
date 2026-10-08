import { describe, expect, it } from 'vitest';
import { createTimeSeriesOption } from '../src/time-series-option';

describe('createTimeSeriesOption', () => {
  it('creates a domain-neutral time axis option', () => {
    const option = createTimeSeriesOption({
      series: [{ name: 'Series A', data: [[0, 1], [1000, 2]] }]
    });
    expect(option.xAxis).toMatchObject({ type: 'time' });
    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series).toHaveLength(1);
  });

  it('can disable data zoom', () => {
    const option = createTimeSeriesOption({ series: [], dataZoom: false });
    expect(option).not.toHaveProperty('dataZoom');
  });
});
