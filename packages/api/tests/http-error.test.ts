import { describe, expect, it } from 'vitest';
import { DefaultApiErrorMapper } from '../src';

describe('DefaultApiErrorMapper', () => {
  it('extracts trace id from W3C traceparent rather than exposing the full header', async () => {
    const response = new Response(JSON.stringify({ title: 'Failure' }), {
      status: 500,
      headers: {
        'content-type': 'application/problem+json',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
      }
    });
    const error = await new DefaultApiErrorMapper().map(response);
    expect(error?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('prefers explicit x-trace-id', async () => {
    const response = new Response(null, {
      status: 503,
      headers: {
        'x-trace-id': 'service-trace',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
      }
    });
    const error = await new DefaultApiErrorMapper().map(response);
    expect(error?.traceId).toBe('service-trace');
  });
});
