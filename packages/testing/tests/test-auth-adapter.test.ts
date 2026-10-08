import { describe, expect, it, vi } from 'vitest';
import { TestAuthAdapter } from '../src';

describe('TestAuthAdapter', () => {
  it('notifies subscribers when state changes', () => {
    const adapter = new TestAuthAdapter({ status: 'anonymous' });
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    adapter.setState({ status: 'authenticated', user: { id: 'test' } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(adapter.getState().status).toBe('authenticated');

    unsubscribe();
    adapter.setState({ status: 'anonymous' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
