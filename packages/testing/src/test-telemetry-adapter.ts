import type { TelemetryAdapter } from '@foundation/observability';

export interface CapturedError {
  error: unknown;
  context?: Readonly<Record<string, unknown>>;
}

export interface CapturedEvent {
  name: string;
  properties?: Readonly<Record<string, unknown>>;
}

export class TestTelemetryAdapter implements TelemetryAdapter {
  readonly errors: CapturedError[] = [];
  readonly events: CapturedEvent[] = [];
  readonly metrics: Array<{ name: string; value: number; attributes?: Readonly<Record<string, string>> }> = [];

  captureError(error: unknown, context?: Readonly<Record<string, unknown>>): void {
    this.errors.push({ error, ...(context ? { context } : {}) });
  }

  trackEvent(name: string, properties?: Readonly<Record<string, unknown>>): void {
    this.events.push({ name, ...(properties ? { properties } : {}) });
  }

  recordMetric(name: string, value: number, attributes?: Readonly<Record<string, string>>): void {
    this.metrics.push({ name, value, ...(attributes ? { attributes } : {}) });
  }
}
