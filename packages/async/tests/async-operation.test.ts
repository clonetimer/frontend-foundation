import { describe, expect, it } from 'vitest';
import { isAsyncOperationTerminal, normalizeOperationProgress } from '../src/async-operation';

describe('async operation helpers', () => {
  it('normalizes progress', () => {
    expect(normalizeOperationProgress(undefined)).toBe(0);
    expect(normalizeOperationProgress(-10)).toBe(0);
    expect(normalizeOperationProgress(55)).toBe(55);
    expect(normalizeOperationProgress(120)).toBe(100);
  });

  it('detects terminal states', () => {
    expect(isAsyncOperationTerminal({ status: 'running' })).toBe(false);
    expect(isAsyncOperationTerminal({ status: 'succeeded' })).toBe(true);
    expect(isAsyncOperationTerminal({ status: 'failed' })).toBe(true);
  });
});
