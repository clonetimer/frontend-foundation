import { AppError } from '@foundation/core';
import { DefaultApiErrorMapper } from './http-error';
import type { ApiErrorContext, ApiTransport, ApiTransportOptions } from './types';

function defaultRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//');
}

function resolveUrl(baseUrl: string, input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url);
  const value = input.toString();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  if (isAbsoluteUrl(value)) return new URL(value, origin);

  const normalizedBase = new URL(baseUrl || '/', origin);
  const base = normalizedBase.href.endsWith('/') ? normalizedBase.href : `${normalizedBase.href}/`;
  // A leading slash is treated as API-root relative, not origin-root relative.
  return new URL(value.replace(/^\/+/, ''), base);
}

function mergeSignals(externalSignal: AbortSignal | null | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  source: () => 'external' | 'timeout' | undefined;
} {
  const controller = new AbortController();
  let abortSource: 'external' | 'timeout' | undefined;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  const abortFromExternal = () => {
    if (abortSource) return;
    abortSource = 'external';
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    timeout = globalThis.setTimeout(() => {
      if (abortSource) return;
      abortSource = 'timeout';
      controller.abort('timeout');
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    source: () => abortSource,
    cleanup: () => {
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  };
}

function validateOptions(options: ApiTransportOptions): void {
  if (!options.baseUrl.trim()) {
    throw new AppError({ kind: 'configuration', message: 'ApiTransport baseUrl cannot be empty' });
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new AppError({ kind: 'configuration', message: 'ApiTransport timeoutMs must be a positive finite number' });
  }
}

function notifyError(options: ApiTransportOptions, error: AppError, context: ApiErrorContext): void {
  try {
    options.onError?.(error, context);
  } catch {
    // Observability/error hooks must never change transport semantics.
  }
}

function accessTokenError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError({
    kind: 'authentication',
    message: 'Unable to acquire access token',
    cause: error
  });
}

export function createApiTransport(options: ApiTransportOptions): ApiTransport {
  validateOptions(options);
  const defaultMapper = new DefaultApiErrorMapper();

  return {
    async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
      const requestId = options.createRequestId?.() ?? defaultRequestId();
      const url = resolveUrl(options.baseUrl, input);
      const method = init.method ?? (input instanceof Request ? input.method : 'GET');
      const context: ApiErrorContext = { requestId, method, url: url.toString() };
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      headers.set('x-request-id', requestId);

      const externalSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
      if (externalSignal?.aborted) {
        const appError = new AppError({ kind: 'cancelled', message: 'Request cancelled', cause: externalSignal.reason });
        notifyError(options, appError, context);
        throw appError;
      }

      if (options.getAccessToken) {
        try {
          const token = await options.getAccessToken();
          if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
        } catch (error) {
          const appError = accessTokenError(error);
          notifyError(options, appError, context);
          throw appError;
        }
      }

      const abort = mergeSignals(externalSignal, options.timeoutMs);

      let response: Response;
      try {
        const target: RequestInfo | URL = input instanceof Request ? input : url;
        response = await globalThis.fetch(target, { ...init, headers, signal: abort.signal });
      } catch (error) {
        const appError = abort.source() === 'timeout'
          ? new AppError({ kind: 'timeout', message: 'Request timed out', retryable: true, cause: error })
          : abort.source() === 'external'
            ? new AppError({ kind: 'cancelled', message: 'Request cancelled', cause: error })
            : new AppError({ kind: 'network', message: 'Network request failed', retryable: true, cause: error });
        notifyError(options, appError, context);
        throw appError;
      } finally {
        abort.cleanup();
      }

      context.status = response.status;
      if (response.ok) return response;

      let mapped: AppError | undefined;
      if (options.errorMapper) {
        try {
          mapped = await options.errorMapper.map(response.clone());
        } catch {
          // A custom mapper is advisory. Fall through to the deterministic default mapper.
        }
      }
      mapped ??= await defaultMapper.map(response.clone());
      mapped ??= new AppError({ kind: 'unknown', message: `HTTP ${response.status}`, status: response.status });
      notifyError(options, mapped, context);
      throw mapped;
    }
  };
}
