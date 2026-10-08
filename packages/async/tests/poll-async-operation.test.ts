import { describe, expect, it } from 'vitest';
import { pollAsyncOperation } from '../src/poll-async-operation';

describe('pollAsyncOperation', () => {
  it('returns immediately when the operation is terminal', async () => {
    const result = await pollAsyncOperation({
      load: async () => ({ id: '1', status: 'succeeded' as const, progress: 100 }),
      intervalMs: 1
    });
    expect(result.status).toBe('succeeded');
  });

  it('rejects a pre-aborted signal as cancelled', async () => {
    const controller = new AbortController();
    controller.abort('test');
    await expect(pollAsyncOperation({
      load: async () => ({ id: '1', status: 'running' as const }),
      signal: controller.signal
    })).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('enforces the overall timeout even when load ignores the signal', async () => {
    await expect(pollAsyncOperation({
      load: async () => await new Promise<never>(() => undefined),
      timeoutMs: 20,
      intervalMs: 1
    })).rejects.toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('cancels promptly even when load ignores the signal', async () => {
    const controller = new AbortController();
    const promise = pollAsyncOperation({
      load: async () => await new Promise<never>(() => undefined),
      timeoutMs: 1_000,
      signal: controller.signal
    });
    globalThis.setTimeout(() => controller.abort('user'), 10);
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('rejects invalid timing options as configuration errors', async () => {
    await expect(pollAsyncOperation({
      load: async () => ({ id: '1', status: 'running' as const }),
      intervalMs: -1
    })).rejects.toMatchObject({ kind: 'configuration' });
  });
});
