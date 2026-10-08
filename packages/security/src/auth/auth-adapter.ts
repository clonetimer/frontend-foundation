import type { AuthState } from './auth-state';

export interface AuthAdapter {
  initialize(): Promise<void>;
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  login?(): Promise<void>;
  logout?(): Promise<void>;
  getAccessToken?(): Promise<string | null>;
}
