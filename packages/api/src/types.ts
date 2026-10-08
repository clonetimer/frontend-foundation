import type { AppError } from '@foundation/core';

export interface ApiErrorContext {
  requestId: string;
  method: string;
  url: string;
  status?: number;
}

export interface ApiErrorMapper {
  map(response: Response): Promise<AppError | undefined>;
}

export interface ApiTransportOptions {
  baseUrl: string;
  timeoutMs: number;
  getAccessToken?: () => Promise<string | null>;
  onError?: (error: AppError, context: ApiErrorContext) => void;
  createRequestId?: () => string;
  errorMapper?: ApiErrorMapper;
}

export interface ApiTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function asFetch(transport: ApiTransport): typeof fetch {
  return (input, init) => transport.fetch(input, init);
}
