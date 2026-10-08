import type { AuthAdapter, AuthState } from '@foundation/security';

export class TestAuthAdapter implements AuthAdapter {
  private readonly listeners = new Set<() => void>();

  constructor(private state: AuthState) {}

  async initialize(): Promise<void> {}

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
