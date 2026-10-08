import { foundationRuntimeConfigSchema } from '@foundation/app';
import { z } from 'zod';

export const runtimeConfigSchema = foundationRuntimeConfigSchema.extend({
  project: z.object({}).default({})
});
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
