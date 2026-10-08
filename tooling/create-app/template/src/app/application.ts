import { createApplication } from '@foundation/app';
import { modules } from '../modules';
import { runtimeConfigSchema, type RuntimeConfig } from './runtime-config';
import { projectBrandTheme } from './project-theme';

export const application = createApplication<RuntimeConfig>({
  id: '{{appId}}',
  version: APP_VERSION,
  runtimeConfig: { schema: runtimeConfigSchema },
  shell: { preset: '{{shellPreset}}' },
  theme: { brand: projectBrandTheme },
  modules
});
