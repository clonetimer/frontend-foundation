import type { AppError } from '@foundation/core';
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

export function applyAppErrorToForm<TFieldValues extends FieldValues>(
  error: AppError,
  setError: UseFormSetError<TFieldValues>
): boolean {
  if (!error.fieldErrors) return false;

  let applied = false;
  for (const [path, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0];
    if (!message) continue;
    setError(path as FieldPath<TFieldValues>, { type: 'server', message });
    applied = true;
  }
  return applied;
}
