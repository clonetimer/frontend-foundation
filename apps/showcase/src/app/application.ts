import { createApplication } from '@foundation/app';
import { homeModule } from '../modules/home/routes';
import { examplesModule } from '../modules/examples/routes';
import { recordsModule } from '../modules/records';
import { capabilitiesModule } from '../modules/capabilities/routes';
import { runtimeConfigSchema, type RuntimeConfig } from './runtime-config';

export const application = createApplication<RuntimeConfig>({
  id: 'foundation-showcase',
  version: APP_VERSION,
  runtimeConfig: { schema: runtimeConfigSchema },
  shell: { preset: 'top-nav' },
  modules: [homeModule, examplesModule, recordsModule, capabilitiesModule],
  theme: { brand: { primaryColor: '#1677ff', borderRadius: 8 } }
});
