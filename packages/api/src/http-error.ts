import { AppError, type AppErrorKind } from '@foundation/core';
import type { ApiErrorMapper } from './types';

interface ProblemLike {
  title?: unknown;
  detail?: unknown;
  code?: unknown;
  traceId?: unknown;
  errors?: unknown;
}

function traceIdFromTraceparent(value: string | null): string | undefined {
  if (!value) return undefined;
  const parts = value.trim().split('-');
  const traceId = parts.length >= 4 ? parts[1] : undefined;
  return traceId && /^[0-9a-f]{32}$/i.test(traceId) ? traceId : undefined;
}

function headerTraceId(response: Response): string | undefined {
  return response.headers.get('x-trace-id') ?? traceIdFromTraceparent(response.headers.get('traceparent'));
}

async function readProblem(response: Response): Promise<ProblemLike | undefined> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('json')) return undefined;
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as ProblemLike : undefined;
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function fieldErrors(value: unknown): Readonly<Record<string, readonly string[]>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, readonly string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = [raw];
    else if (Array.isArray(raw)) {
      const messages = raw.filter((item): item is string => typeof item === 'string');
      if (messages.length) result[key] = messages;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

export class DefaultApiErrorMapper implements ApiErrorMapper {
  async map(response: Response): Promise<AppError | undefined> {
    if (response.ok) return undefined;

    const problem = await readProblem(response);
    const traceId = asString(problem?.traceId) ?? headerTraceId(response);
    const detail = asString(problem?.detail);
    const title = asString(problem?.title);
    const code = asString(problem?.code);
    const errors = fieldErrors(problem?.errors);

    return new AppError({
      kind: kindForStatus(response.status),
      message: title ?? `HTTP ${response.status}`,
      status: response.status,
      retryable: [500, 502, 503, 504].includes(response.status),
      ...(detail ? { detail } : {}),
      ...(traceId ? { traceId } : {}),
      ...(code ? { code } : {}),
      ...(errors ? { fieldErrors: errors } : {})
    });
  }
}
