export interface TelemetryAdapter {
  captureError(error: unknown, context?: Readonly<Record<string, unknown>>): void;
  trackEvent(name: string, properties?: Readonly<Record<string, unknown>>): void;
  recordMetric?(name: string, value: number, attributes?: Readonly<Record<string, string>>): void;
}
