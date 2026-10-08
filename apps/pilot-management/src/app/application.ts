import { createApplication } from '@foundation/app';
import { homeModule } from '../modules/home';
import { runtimeConfigSchema, type RuntimeConfig } from './runtime-config';

export const application = createApplication<RuntimeConfig>({
  id: 'foundation-pilot-management',
  version: APP_VERSION,
  runtimeConfig: { schema: runtimeConfigSchema },
  modules: [homeModule]
});
