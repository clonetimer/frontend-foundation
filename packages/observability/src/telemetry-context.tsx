import { createContext, useContext, type PropsWithChildren } from 'react';
import type { TelemetryAdapter } from './telemetry-adapter';

const TelemetryContext = createContext<TelemetryAdapter | null>(null);

export function TelemetryProvider({ adapter, children }: PropsWithChildren<{ adapter: TelemetryAdapter }>) {
  return <TelemetryContext.Provider value={adapter}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry(): TelemetryAdapter {
  const adapter = useContext(TelemetryContext);
  if (!adapter) throw new Error('TelemetryProvider is missing');
  return adapter;
}
