import { z } from 'zod';

export const foundationRuntimeConfigSchema = z.object({
  app: z.object({
    name: z.string().min(1),
    environment: z.enum(['development', 'test', 'staging', 'production'])
  }),
  api: z.object({
    baseUrl: z.string().min(1),
    timeoutMs: z.number().finite().int().positive().default(30_000)
  }),
  router: z.object({
    mode: z.enum(['browser', 'hash']).default('browser'),
    basename: z.string().optional()
  }),
  ui: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    density: z.enum(['default', 'compact']).default('default')
  }),
  features: z.record(z.string(), z.boolean()).default({})
});

export type FoundationRuntimeConfig = z.infer<typeof foundationRuntimeConfigSchema>;
