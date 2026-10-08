import type { TelemetryAdapter } from './telemetry-adapter';

export class ConsoleTelemetryAdapter implements TelemetryAdapter {
  captureError(error: unknown, context?: Readonly<Record<string, unknown>>): void {
    console.error('[foundation:error]', error, context);
  }

  trackEvent(name: string, properties?: Readonly<Record<string, unknown>>): void {
    console.debug('[foundation:event]', name, properties);
  }

  recordMetric(name: string, value: number, attributes?: Readonly<Record<string, string>>): void {
    console.debug('[foundation:metric]', name, value, attributes);
  }
}
