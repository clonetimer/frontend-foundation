export interface TimeSeriesChartProps {
  seriesKey: string;
  sampleCount?: number;
  showLegend?: boolean;
  onRangeChange?: (range: string) => void;
}

export function TimeSeriesChart({ seriesKey, sampleCount = 32, showLegend = true, onRangeChange }: TimeSeriesChartProps) {
  const points = Array.from({ length: 16 }, (_, index) => `${index * 25},${70 - Math.sin(index / 2) * 30}`).join(' ');
  return (
    <section aria-label={`Time-series chart ${seriesKey}`} style={{ border: '1px solid currentColor', borderRadius: 8, padding: 16 }}>
      {showLegend ? <strong>{seriesKey} · {sampleCount} samples</strong> : null}
      <svg viewBox="0 0 400 120" role="img" aria-label={`${seriesKey} time-series preview`} style={{ width: '100%', height: 120 }}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <label>
        Window
        <select defaultValue="10m" onChange={(event) => onRangeChange?.(event.currentTarget.value)}>
          <option value="10m">10 min</option>
          <option value="1h">1 hour</option>
          <option value="6h">6 hours</option>
        </select>
      </label>
    </section>
  );
}
