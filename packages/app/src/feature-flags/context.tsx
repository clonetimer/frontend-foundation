import { createContext, useContext, type PropsWithChildren } from 'react';

const FeatureFlagContext = createContext<Readonly<Record<string, boolean>>>({});

export function FeatureFlagProvider({ flags, children }: PropsWithChildren<{ flags: Readonly<Record<string, boolean>> }>) {
  return <FeatureFlagContext.Provider value={flags}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlag(name: string): boolean {
  return useContext(FeatureFlagContext)[name] === true;
}
