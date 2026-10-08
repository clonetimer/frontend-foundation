import { describe, expect, it } from 'vitest';
import { AppError } from '@foundation/core';
import { createFoundationQueryClient } from '../src';

function retryDecision(failureCount: number, error: Error): boolean {
  const retry = createFoundationQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('Expected function retry policy');
  return retry(failureCount, error);
}

describe('Foundation QueryClient retry policy', () => {
  it('retries transient network errors only within the retry budget', () => {
    const error = new AppError({ kind: 'network', message: 'offline', retryable: true });
    expect(retryDecision(0, error)).toBe(true);
    expect(retryDecision(1, error)).toBe(true);
    expect(retryDecision(2, error)).toBe(false);
  });

  it('does not retry authorization or non-AppError failures', () => {
    expect(retryDecision(0, new AppError({ kind: 'authorization', message: 'denied', retryable: false }))).toBe(false);
    expect(retryDecision(0, new Error('unknown'))).toBe(false);
  });

  it('keeps mutation retries disabled by default', () => {
    expect(createFoundationQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
