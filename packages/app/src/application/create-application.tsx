import { createRoot, type Root } from 'react-dom/client';
import { createApiTransport } from '@foundation/api';
import { normalizeError } from '@foundation/core';
import { ConsoleTelemetryAdapter, safeTelemetryAdapter } from '@foundation/observability';
import { NoAuthAdapter, type AuthAdapter } from '@foundation/security';
import { BootstrapErrorPage } from '@foundation/ui';
import type { FoundationRuntimeConfig } from '../runtime-config/schema';
import { loadRuntimeConfig } from '../runtime-config/load-runtime-config';
import { resolveModules } from '../module/resolve-modules';
import { collectNavigation } from '../routing/navigation';
import { createFoundationRouter } from '../routing/create-router';
import { createFoundationQueryClient } from '../query/create-query-client';
import { ApplicationTree } from '../providers/application-tree';
import type { ApplicationDefinition, FoundationApplication } from './types';

export function createApplication<TConfig extends FoundationRuntimeConfig>(definition: ApplicationDefinition<TConfig>): FoundationApplication {
  let root: Root | null = null;
  let state: 'created' | 'mounting' | 'mounted' | 'failed' | 'unmounted' = 'created';

  return {
    async mount(rootElement: HTMLElement): Promise<void> {
      if (state !== 'created') throw new Error(`Application cannot mount from state ${state}`);
      state = 'mounting';
      let telemetry = safeTelemetryAdapter(new ConsoleTelemetryAdapter());

      try {
        const config = await loadRuntimeConfig(definition.runtimeConfig.url ?? '/runtime-config.json', definition.runtimeConfig.schema);
        const adapterContext = { config, app: { id: definition.id, version: definition.version } };

        if (definition.adapters?.createTelemetry) {
          try {
            telemetry = safeTelemetryAdapter(definition.adapters.createTelemetry(adapterContext));
          } catch (error) {
            telemetry.captureError(error, { type: 'telemetry_initialization', fallback: 'console' });
          }
        }

        const auth: AuthAdapter = definition.adapters?.createAuth?.(adapterContext) ?? new NoAuthAdapter();
        await auth.initialize();

        const apiTransport = createApiTransport({
          baseUrl: config.api.baseUrl,
          timeoutMs: config.api.timeoutMs,
          ...(auth.getAccessToken ? { getAccessToken: () => auth.getAccessToken!() } : {}),
          onError: (error, context) => telemetry.captureError(error, { type: 'api', ...context })
        });
        const queryClient = createFoundationQueryClient();
        const modules = resolveModules(definition.modules, config.features);
        const routes = modules.flatMap((module) => module.routes);
        const navigation = collectNavigation(routes);
        const router = createFoundationRouter({
          routes,
          mode: config.router.mode,
          ...(config.router.basename ? { basename: config.router.basename } : {}),
          ...(definition.shell ? { shell: definition.shell } : {})
        });

        root = createRoot(rootElement);
        root.render(
          <ApplicationTree
            config={config}
            telemetry={telemetry}
            auth={auth}
            apiTransport={apiTransport}
            queryClient={queryClient}
            router={router}
            navigation={navigation}
            brand={definition.theme?.brand}
          />
        );

        telemetry.trackEvent('app_started', {
          appId: definition.id,
          version: definition.version,
          environment: config.app.environment
        });
        state = 'mounted';
      } catch (error) {
        state = 'failed';
        const appError = normalizeError(error);
        telemetry.captureError(appError, { type: 'bootstrap', appId: definition.id, version: definition.version });
        root ??= createRoot(rootElement);
        root.render(<BootstrapErrorPage error={appError} />);
        throw appError;
      }
    },

    unmount(): void {
      root?.unmount();
      root = null;
      state = 'unmounted';
    }
  };
}
