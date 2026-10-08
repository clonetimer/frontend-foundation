import { createContext, useContext, type PropsWithChildren } from 'react';
import type { FoundationRuntimeConfig } from './schema';

const RuntimeConfigContext = createContext<FoundationRuntimeConfig | null>(null);

export function RuntimeConfigProvider<TConfig extends FoundationRuntimeConfig>({ config, children }: PropsWithChildren<{ config: TConfig }>) {
  return <RuntimeConfigContext.Provider value={config}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig<TConfig extends FoundationRuntimeConfig = FoundationRuntimeConfig>(): TConfig {
  const config = useContext(RuntimeConfigContext);
  if (!config) throw new Error('RuntimeConfigProvider is missing');
  return config as TConfig;
}
