import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@foundation/core';
import { applyAppErrorToForm } from '../src/apply-app-error';

interface Values { title: string; }

describe('applyAppErrorToForm', () => {
  it('maps server field errors into react-hook-form setError', () => {
    const setError = vi.fn();
    const error = new AppError({
      kind: 'validation',
      message: 'Validation failed',
      fieldErrors: { title: ['Title is invalid'] }
    });

    expect(applyAppErrorToForm<Values>(error, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith('title', { type: 'server', message: 'Title is invalid' });
  });

  it('returns false when there are no field errors', () => {
    const setError = vi.fn();
    const error = new AppError({ kind: 'server', message: 'Unavailable' });
    expect(applyAppErrorToForm<Values>(error, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
