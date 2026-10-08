import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createApiTransport } from '../src';

const server = setupServer(
  http.get('http://localhost/api/examples', () => HttpResponse.json([{ id: 'EX-001' }])),
  http.get('http://localhost/api/fail', () => HttpResponse.json(
    { title: 'Unavailable', detail: 'Please retry later', code: 'TEMPORARY', traceId: 'trace-503' },
    { status: 503 }
  )),
  http.get('http://localhost/api/invalid', () => HttpResponse.json(
    { title: 'Invalid', errors: { name: ['Required'] } },
    { status: 422 }
  )),
  http.get('http://localhost/api/headers', ({ request }) => HttpResponse.json({
    authorization: request.headers.get('authorization'),
    requestId: request.headers.get('x-request-id')
  }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => server.close());

describe('ApiTransport', () => {
  it('resolves relative URL against baseUrl', async () => {
    const transport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000, createRequestId: () => 'test-request' });
    const response = await transport.fetch('examples');
    expect(await response.json()).toEqual([{ id: 'EX-001' }]);
  });

  it('treats leading slash as API-root relative', async () => {
    const transport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000 });
    const response = await transport.fetch('/examples');
    expect(response.status).toBe(200);
  });


  it('injects access token and request id without coupling to the auth package', async () => {
    const transport = createApiTransport({
      baseUrl: '/api',
      timeoutMs: 1000,
      getAccessToken: async () => 'token-123',
      createRequestId: () => 'request-123'
    });
    const response = await transport.fetch('headers');
    expect(await response.json()).toEqual({ authorization: 'Bearer token-123', requestId: 'request-123' });
  });

  it('maps problem details and retryable server errors', async () => {
    const transport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000 });
    await expect(transport.fetch('fail')).rejects.toMatchObject({
      kind: 'server', status: 503, retryable: true, code: 'TEMPORARY', traceId: 'trace-503', detail: 'Please retry later'
    });
  });

  it('maps validation field errors', async () => {
    const transport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000 });
    await expect(transport.fetch('invalid')).rejects.toMatchObject({
      kind: 'validation', fieldErrors: { name: ['Required'] }
    });
  });

  it('preserves already-aborted signals as cancellation without acquiring a token', async () => {
    const controller = new AbortController();
    controller.abort();
    const getAccessToken = vi.fn(async () => 'token');
    const transport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000, getAccessToken });
    await expect(transport.fetch('examples', { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('distinguishes transport timeouts from external cancellation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    const timeoutTransport = createApiTransport({ baseUrl: '/api', timeoutMs: 10 });
    await expect(timeoutTransport.fetch('slow')).rejects.toMatchObject({ kind: 'timeout', retryable: true });

    const controller = new AbortController();
    const cancelTransport = createApiTransport({ baseUrl: '/api', timeoutMs: 1000 });
    const request = cancelTransport.fetch('slow', { signal: controller.signal });
    controller.abort('user');
    await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

describe('ApiTransport boundary isolation', () => {
  it('maps access-token callback failures as authentication errors', async () => {
    const onErrorKinds: string[] = [];
    const transport = createApiTransport({
      baseUrl: '/api',
      timeoutMs: 1000,
      getAccessToken: async () => { throw new Error('identity provider unavailable'); },
      onError: (error) => onErrorKinds.push(error.kind)
    });

    await expect(transport.fetch('examples')).rejects.toMatchObject({ kind: 'authentication' });
    expect(onErrorKinds).toEqual(['authentication']);
  });

  it('does not let observability callbacks or custom mappers change HTTP error semantics', async () => {
    const transport = createApiTransport({
      baseUrl: '/api',
      timeoutMs: 1000,
      onError: () => { throw new Error('telemetry unavailable'); },
      errorMapper: {
        async map() { throw new Error('custom mapper unavailable'); }
      }
    });

    await expect(transport.fetch('fail')).rejects.toMatchObject({
      kind: 'server',
      status: 503,
      code: 'TEMPORARY'
    });
  });
});
