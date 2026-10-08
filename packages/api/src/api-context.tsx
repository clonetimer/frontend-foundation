import { createContext, useContext, type PropsWithChildren } from 'react';
import type { ApiTransport } from './types';

const ApiContext = createContext<ApiTransport | null>(null);

export function ApiProvider({ transport, children }: PropsWithChildren<{ transport: ApiTransport }>) {
  return <ApiContext.Provider value={transport}>{children}</ApiContext.Provider>;
}

export function useApiTransport(): ApiTransport {
  const transport = useContext(ApiContext);
  if (!transport) throw new Error('ApiProvider is missing');
  return transport;
}
