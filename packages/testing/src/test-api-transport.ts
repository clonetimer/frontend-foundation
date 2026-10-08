import type { ApiTransport } from '@foundation/api';

export type TestApiHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response;

export class TestApiTransport implements ApiTransport {
  readonly calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  constructor(private readonly handler: TestApiHandler = () => Response.json({})) {}

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    this.calls.push({ input, ...(init ? { init } : {}) });
    return this.handler(input, init);
  }
}
