import { describe, expect, it } from 'vitest';
import { safeTelemetryAdapter, type TelemetryAdapter } from '../src';

describe('safeTelemetryAdapter', () => {
  it('never leaks delegate failures into application control flow', () => {
    const broken: TelemetryAdapter = {
      captureError() { throw new Error('telemetry down'); },
      trackEvent() { throw new Error('telemetry down'); },
      recordMetric() { throw new Error('telemetry down'); }
    };
    const safe = safeTelemetryAdapter(broken);
    expect(() => safe.captureError(new Error('app'))).not.toThrow();
    expect(() => safe.trackEvent('event')).not.toThrow();
    expect(() => safe.recordMetric?.('metric', 1)).not.toThrow();
  });
});
