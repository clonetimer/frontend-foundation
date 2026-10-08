import type { FoundationRuntimeConfig } from '@foundation/app';

export interface TestRuntimeConfigOverrides {
  app?: Partial<FoundationRuntimeConfig['app']>;
  api?: Partial<FoundationRuntimeConfig['api']>;
  router?: Partial<FoundationRuntimeConfig['router']>;
  ui?: Partial<FoundationRuntimeConfig['ui']>;
  features?: Readonly<Record<string, boolean>>;
}

export function createTestRuntimeConfig(overrides: TestRuntimeConfigOverrides = {}): FoundationRuntimeConfig {
  return {
    app: {
      name: 'Test Application',
      environment: 'test',
      ...overrides.app
    },
    api: {
      baseUrl: '/api',
      timeoutMs: 30_000,
      ...overrides.api
    },
    router: {
      mode: 'browser',
      ...overrides.router
    },
    ui: {
      theme: 'light',
      density: 'default',
      ...overrides.ui
    },
    features: { ...overrides.features }
  };
}
