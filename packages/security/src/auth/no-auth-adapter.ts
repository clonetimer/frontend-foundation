import type { AuthAdapter } from './auth-adapter';
import type { AuthState } from './auth-state';

export class NoAuthAdapter implements AuthAdapter {
  private readonly state: AuthState = {
    status: 'authenticated',
    user: {
      id: 'local',
      displayName: 'Local User',
      permissions: ['*']
    }
  };

  async initialize(): Promise<void> {}
  getState(): AuthState { return this.state; }
  subscribe(): () => void { return () => undefined; }
}
