import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, PropsWithChildren } from 'react';
import { ApiProvider, type ApiTransport } from '@foundation/api';
import {
  FeatureFlagProvider,
  RuntimeConfigProvider,
  createFoundationQueryClient,
  type FoundationRuntimeConfig
} from '@foundation/app';
import { TelemetryProvider, type TelemetryAdapter } from '@foundation/observability';
import { AuthProvider, type AuthAdapter } from '@foundation/security';
import { FoundationThemeProvider } from '@foundation/theme';
import { TestApiTransport } from './test-api-transport';
import { TestAuthAdapter } from './test-auth-adapter';
import { createTestRuntimeConfig } from './test-runtime-config';
import { TestTelemetryAdapter } from './test-telemetry-adapter';

export interface FoundationRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  config?: FoundationRuntimeConfig;
  auth?: AuthAdapter;
  api?: ApiTransport;
  telemetry?: TelemetryAdapter;
  queryClient?: QueryClient;
}

export interface FoundationRenderResult extends RenderResult {
  foundation: {
    config: FoundationRuntimeConfig;
    auth: AuthAdapter;
    api: ApiTransport;
    telemetry: TelemetryAdapter;
    queryClient: QueryClient;
  };
}

export function renderWithFoundation(
  ui: ReactElement,
  options: FoundationRenderOptions = {}
): FoundationRenderResult {
  const {
    config = createTestRuntimeConfig(),
    auth = new TestAuthAdapter({
      status: 'authenticated',
      user: { id: 'test-user', displayName: 'Test User', permissions: ['*'] }
    }),
    api = new TestApiTransport(),
    telemetry = new TestTelemetryAdapter(),
    queryClient = createFoundationQueryClient(),
    ...renderOptions
  } = options;

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <TelemetryProvider adapter={telemetry}>
        <RuntimeConfigProvider config={config}>
          <FoundationThemeProvider defaultMode={config.ui.theme} defaultDensity={config.ui.density}>
            <AuthProvider adapter={auth}>
              <ApiProvider transport={api}>
                <QueryClientProvider client={queryClient}>
                  <FeatureFlagProvider flags={config.features}>{children}</FeatureFlagProvider>
                </QueryClientProvider>
              </ApiProvider>
            </AuthProvider>
          </FoundationThemeProvider>
        </RuntimeConfigProvider>
      </TelemetryProvider>
    );
  }

  const result = render(ui, { ...renderOptions, wrapper: Wrapper });
  return Object.assign(result, {
    foundation: { config, auth, api, telemetry, queryClient }
  });
}
