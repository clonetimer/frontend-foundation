import { AppError, normalizeError } from '@foundation/core';
import type { AsyncOperation } from './async-operation';
import { isAsyncOperationTerminal } from './async-operation';
import { sleep, throwIfAborted } from './internal/sleep';

export interface PollAsyncOperationOptions<TOperation extends AsyncOperation> {
  load(signal: AbortSignal): Promise<TOperation>;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onUpdate?: (operation: TOperation) => void;
  isTerminal?: (operation: TOperation) => boolean;
}

function timeoutError(cause?: unknown): AppError {
  return new AppError({
    kind: 'timeout',
    message: 'Async operation polling timed out',
    retryable: true,
    ...(cause !== undefined ? { cause } : {})
  });
}

function cancelledError(signal: AbortSignal, cause?: unknown): AppError {
  return new AppError({
    kind: 'cancelled',
    message: 'Operation cancelled',
    cause: cause ?? signal.reason
  });
}

function validateTiming(intervalMs: number, timeoutMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new AppError({ kind: 'configuration', message: 'Polling intervalMs must be a non-negative finite number' });
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AppError({ kind: 'configuration', message: 'Polling timeoutMs must be a positive finite number' });
  }
}

async function loadBeforeDeadline<TOperation extends AsyncOperation>(
  load: (signal: AbortSignal) => Promise<TOperation>,
  deadline: number,
  signal?: AbortSignal
): Promise<TOperation> {
  throwIfAborted(signal);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError();

  const controller = new AbortController();
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = globalThis.setTimeout(() => {
      controller.abort('timeout');
      reject(timeoutError());
    }, remaining);
  });

  const pending: Promise<TOperation | never>[] = [load(controller.signal), timeoutPromise];

  if (signal) {
    pending.push(new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort(signal.reason);
        reject(cancelledError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }));
  }

  try {
    return await Promise.race(pending);
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'timeout' || error.kind === 'cancelled')) throw error;
    if (signal?.aborted) throw cancelledError(signal, error);
    throw normalizeError(error);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export async function pollAsyncOperation<TOperation extends AsyncOperation>({
  load,
  intervalMs = 1000,
  timeoutMs = 5 * 60_000,
  signal,
  onUpdate,
  isTerminal = isAsyncOperationTerminal
}: PollAsyncOperationOptions<TOperation>): Promise<TOperation> {
  validateTiming(intervalMs, timeoutMs);
  throwIfAborted(signal);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const operation = await loadBeforeDeadline(load, deadline, signal);
    onUpdate?.(operation);
    if (isTerminal(operation)) return operation;

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timeoutError();
    await sleep(Math.min(intervalMs, remaining), signal);
  }
}
