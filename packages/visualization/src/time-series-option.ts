import type { EChartsOption } from 'echarts';

export type TimeSeriesXValue = string | number;
export type TimeSeriesPoint = readonly [TimeSeriesXValue, number | null];

export interface TimeSeriesSeries {
  name: string;
  data: readonly TimeSeriesPoint[];
  smooth?: boolean;
  area?: boolean;
}

export interface CreateTimeSeriesOptionOptions {
  series: readonly TimeSeriesSeries[];
  yAxisName?: string;
  showLegend?: boolean;
  dataZoom?: boolean;
}

export function createTimeSeriesOption({
  series,
  yAxisName,
  showLegend = series.length > 1,
  dataZoom = true
}: CreateTimeSeriesOptionOptions): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: 'axis' },
    legend: { show: showLegend },
    grid: { left: 56, right: 24, top: 40, bottom: dataZoom ? 68 : 36, containLabel: true },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', scale: true, ...(yAxisName ? { name: yAxisName } : {}) },
    ...(dataZoom ? { dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20 }] } : {}),
    series: series.map((item) => ({
      name: item.name,
      type: 'line' as const,
      showSymbol: false,
      smooth: item.smooth ?? false,
      ...(item.area ? { areaStyle: {} } : {}),
      data: item.data.map(([x, y]) => [x, y])
    }))
  };
}
