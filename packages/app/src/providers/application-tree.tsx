import { StrictMode } from 'react';
import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { DataRouter } from 'react-router';
import { ApiProvider, type ApiTransport } from '@foundation/api';
import { AuthProvider, type AuthAdapter } from '@foundation/security';
import { TelemetryProvider, type TelemetryAdapter } from '@foundation/observability';
import { FoundationThemeProvider, type BrandTheme } from '@foundation/theme';
import { FatalErrorBoundary } from '@foundation/ui';
import { FeatureFlagProvider } from '../feature-flags/context';
import { RuntimeConfigProvider } from '../runtime-config/context';
import { NavigationProvider } from '../routing/navigation-context';
import type { NavigationItem } from '../routing/navigation';
import type { FoundationRuntimeConfig } from '../runtime-config/schema';

export function ApplicationTree<TConfig extends FoundationRuntimeConfig>(props: {
  config: TConfig;
  telemetry: TelemetryAdapter;
  auth: AuthAdapter;
  apiTransport: ApiTransport;
  queryClient: QueryClient;
  router: DataRouter;
  navigation: readonly NavigationItem[];
  brand: BrandTheme | undefined;
}) {
  return (
    <StrictMode>
      <FatalErrorBoundary onError={(error, info) => props.telemetry.captureError(error, { type: 'react', componentStack: info.componentStack })}>
      <TelemetryProvider adapter={props.telemetry}>
        <RuntimeConfigProvider config={props.config}>
          <FoundationThemeProvider defaultMode={props.config.ui.theme} defaultDensity={props.config.ui.density} brand={props.brand}>
            <AuthProvider adapter={props.auth}>
              <ApiProvider transport={props.apiTransport}>
                <QueryClientProvider client={props.queryClient}>
                  <FeatureFlagProvider flags={props.config.features}>
                    <NavigationProvider navigation={props.navigation}>
                      <RouterProvider router={props.router} />
                    </NavigationProvider>
                  </FeatureFlagProvider>
                </QueryClientProvider>
              </ApiProvider>
            </AuthProvider>
          </FoundationThemeProvider>
        </RuntimeConfigProvider>
      </TelemetryProvider>
      </FatalErrorBoundary>
    </StrictMode>
  );
}
