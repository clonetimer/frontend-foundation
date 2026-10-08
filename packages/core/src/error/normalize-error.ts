import { AppError } from './app-error';

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
    return new AppError({
      kind: 'cancelled',
      message: 'Operation cancelled',
      cause: error
    });
  }

  if (error instanceof Error) {
    return new AppError({
      kind: 'unknown',
      message: error.message || 'Unknown error',
      cause: error
    });
  }

  return new AppError({
    kind: 'unknown',
    message: 'Unknown error',
    cause: error
  });
}
