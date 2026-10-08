import { createContext, useContext, type PropsWithChildren } from 'react';
import type { NavigationItem } from './navigation';

const NavigationContext = createContext<readonly NavigationItem[]>([]);
export function NavigationProvider({ navigation, children }: PropsWithChildren<{ navigation: readonly NavigationItem[] }>) {
  return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
}
export function useNavigationModel(): readonly NavigationItem[] { return useContext(NavigationContext); }
