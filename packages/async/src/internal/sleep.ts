import { AppError } from '@foundation/core';

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError({ kind: 'cancelled', message: 'Operation cancelled', cause: signal.reason });
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      cleanup();
      reject(new AppError({ kind: 'cancelled', message: 'Operation cancelled', cause: signal?.reason }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
