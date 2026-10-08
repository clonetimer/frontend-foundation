import { describe, expect, it } from 'vitest';
import { AppError, normalizeError } from '../src';

describe('normalizeError', () => {
  it('keeps AppError identity', () => {
    const error = new AppError({ kind: 'network', message: 'offline' });
    expect(normalizeError(error)).toBe(error);
  });

  it('normalizes Error', () => {
    const error = normalizeError(new Error('boom'));
    expect(error.kind).toBe('unknown');
    expect(error.message).toBe('boom');
  });
});
