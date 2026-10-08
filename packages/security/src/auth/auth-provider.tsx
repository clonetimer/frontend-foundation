import { createContext, useContext, useSyncExternalStore, type PropsWithChildren } from 'react';
import type { AuthAdapter } from './auth-adapter';
import type { AuthState } from './auth-state';

const AuthAdapterContext = createContext<AuthAdapter | null>(null);

export function AuthProvider({ adapter, children }: PropsWithChildren<{ adapter: AuthAdapter }>) {
  return <AuthAdapterContext.Provider value={adapter}>{children}</AuthAdapterContext.Provider>;
}

export function useAuthAdapter(): AuthAdapter {
  const adapter = useContext(AuthAdapterContext);
  if (!adapter) throw new Error('AuthProvider is missing');
  return adapter;
}

export function useAuth(): AuthState {
  const adapter = useAuthAdapter();
  return useSyncExternalStore(
    (listener) => adapter.subscribe(listener),
    () => adapter.getState(),
    () => adapter.getState()
  );
}
