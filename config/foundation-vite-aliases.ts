import { fileURLToPath } from 'node:url';

export const foundationAliases = {
  '@foundation/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
  '@foundation/theme': fileURLToPath(new URL('../packages/theme/src/index.ts', import.meta.url)),
  '@foundation/ui': fileURLToPath(new URL('../packages/ui/src/index.ts', import.meta.url)),
  '@foundation/api': fileURLToPath(new URL('../packages/api/src/index.ts', import.meta.url)),
  '@foundation/security': fileURLToPath(new URL('../packages/security/src/index.ts', import.meta.url)),
  '@foundation/observability': fileURLToPath(new URL('../packages/observability/src/index.ts', import.meta.url)),
  '@foundation/app': fileURLToPath(new URL('../packages/app/src/index.ts', import.meta.url)),
  '@foundation/testing': fileURLToPath(new URL('../packages/testing/src/index.ts', import.meta.url)),
  '@foundation/data': fileURLToPath(new URL('../packages/data/src/index.ts', import.meta.url)),
  '@foundation/forms': fileURLToPath(new URL('../packages/forms/src/index.ts', import.meta.url)),
  '@foundation/file': fileURLToPath(new URL('../packages/file/src/index.ts', import.meta.url)),
  '@foundation/async': fileURLToPath(new URL('../packages/async/src/index.ts', import.meta.url)),
  '@foundation/visualization': fileURLToPath(new URL('../packages/visualization/src/index.ts', import.meta.url))
} as const;
