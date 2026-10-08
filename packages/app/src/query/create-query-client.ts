import { QueryClient } from '@tanstack/react-query';
import { AppError } from '@foundation/core';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof AppError)) return false;
  return error.retryable && ['network', 'timeout', 'server'].includes(error.kind);
}

export function createFoundationQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetry },
      mutations: { retry: false }
    }
  });
}
