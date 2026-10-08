import type { TelemetryAdapter } from './telemetry-adapter';

/**
 * Observability is best-effort infrastructure. A telemetry backend must never
 * be able to break application control flow.
 */
export function safeTelemetryAdapter(delegate: TelemetryAdapter): TelemetryAdapter {
  return {
    captureError(error, context) {
      try { delegate.captureError(error, context); } catch { /* best effort */ }
    },
    trackEvent(name, properties) {
      try { delegate.trackEvent(name, properties); } catch { /* best effort */ }
    },
    ...(delegate.recordMetric
      ? {
          recordMetric(name: string, value: number, attributes?: Readonly<Record<string, string>>) {
            try { delegate.recordMetric?.(name, value, attributes); } catch { /* best effort */ }
          }
        }
      : {})
  };
}
