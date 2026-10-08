import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { BrandTheme, Density, ResolvedThemeMode, ThemeMode } from './theme-types';

const THEME_KEY = 'foundation.ui.theme';
const DENSITY_KEY = 'foundation.ui.density';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  density: Density;
  brand: BrandTheme | undefined;
  setMode(mode: ThemeMode): void;
  setDensity(density: Density): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function safeStorageGet(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; }
  catch { return null; }
}

function safeStorageSet(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); }
  catch { /* Storage may be disabled in sandboxed WebViews/private modes. */ }
}

function readThemeMode(defaultMode: ThemeMode): ThemeMode {
  const value = safeStorageGet(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : defaultMode;
}

function readDensity(defaultDensity: Density): Density {
  const value = safeStorageGet(DENSITY_KEY);
  return value === 'default' || value === 'compact' ? value : defaultDensity;
}

function systemTheme(): ResolvedThemeMode {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function FoundationThemeProvider({
  defaultMode,
  defaultDensity,
  brand,
  children
}: PropsWithChildren<{
  defaultMode: ThemeMode;
  defaultDensity: Density;
  brand?: BrandTheme | undefined;
}>) {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode(defaultMode));
  const [density, setDensityState] = useState<Density>(() => readDensity(defaultDensity));
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(() => systemTheme());

  useEffect(() => {
    if (!globalThis.matchMedia) return;
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemMode(media.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolvedMode = mode === 'system' ? systemMode : mode;
  const setMode = (next: ThemeMode) => { setModeState(next); safeStorageSet(THEME_KEY, next); };
  const setDensity = (next: Density) => { setDensityState(next); safeStorageSet(DENSITY_KEY, next); };

  const config = useMemo<ThemeConfig>(() => {
    const baseAlgorithm = resolvedMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
    const algorithm = density === 'compact' ? [baseAlgorithm, antdTheme.compactAlgorithm] : baseAlgorithm;
    return {
      algorithm,
      token: {
        ...(brand?.primaryColor ? { colorPrimary: brand.primaryColor } : {}),
        ...(brand?.borderRadius !== undefined ? { borderRadius: brand.borderRadius } : {}),
        ...(brand?.fontFamily ? { fontFamily: brand.fontFamily } : {}),
        ...(brand?.token ?? {})
      },
      ...(brand?.components ? { components: brand.components } : {})
    };
  }, [brand, density, resolvedMode]);

  return (
    <ThemeContext.Provider value={{ mode, resolvedMode, density, brand, setMode, setDensity }}>
      <ConfigProvider theme={config} componentSize={density === 'compact' ? 'small' : 'middle'}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('FoundationThemeProvider is missing');
  return value;
}
