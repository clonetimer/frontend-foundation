import type { ZodType } from 'zod';
import type { AuthAdapter } from '@foundation/security';
import type { TelemetryAdapter } from '@foundation/observability';
import type { BrandTheme } from '@foundation/theme';
import type { FoundationRuntimeConfig } from '../runtime-config/schema';
import type { ApplicationModule } from '../module/application-module';
import type { ApplicationShell } from '../shell/shell-types';

export interface AdapterFactoryContext<TConfig extends FoundationRuntimeConfig> {
  config: TConfig;
  app: { id: string; version: string };
}

export interface ApplicationDefinition<TConfig extends FoundationRuntimeConfig> {
  id: string;
  version: string;
  runtimeConfig: { schema: ZodType<TConfig>; url?: string };
  modules: readonly ApplicationModule[];
  /** Select a built-in shell or provide a project-owned shell component. */
  shell?: ApplicationShell;
  adapters?: {
    createAuth?: (context: AdapterFactoryContext<TConfig>) => AuthAdapter;
    createTelemetry?: (context: AdapterFactoryContext<TConfig>) => TelemetryAdapter;
  };
  theme?: { brand?: BrandTheme };
}

export interface FoundationApplication {
  mount(root: HTMLElement): Promise<void>;
  unmount(): void;
}
