import { EChart } from './e-chart';
import { createTimeSeriesOption } from './time-series-option';
import type { CreateTimeSeriesOptionOptions } from './time-series-option';

export function TimeSeriesChart({
  series,
  yAxisName,
  showLegend,
  dataZoom,
  height = 320,
  loading = false,
  ariaLabel
}: CreateTimeSeriesOptionOptions & { height?: number | string; loading?: boolean; ariaLabel?: string }) {
  const option = createTimeSeriesOption({
    series,
    ...(yAxisName !== undefined ? { yAxisName } : {}),
    ...(showLegend !== undefined ? { showLegend } : {}),
    ...(dataZoom !== undefined ? { dataZoom } : {})
  });
  return <EChart option={option} height={height} loading={loading} ariaLabel={ariaLabel ?? '时间序列图'} />;
}
