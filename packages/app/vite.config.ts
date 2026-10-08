import { defineConfig } from 'vite';
import { foundationAliases } from '../../config/foundation-vite-aliases.ts';

export default defineConfig({
  resolve: { alias: foundationAliases },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rolldownOptions: {
      external: [
        'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react-router',
  'react-router/dom',
  'antd',
  '@tanstack/react-query',
  'zod',
  '@foundation/core',
  '@foundation/theme',
  '@foundation/ui',
  '@foundation/api',
  '@foundation/security',
  '@foundation/observability'
      ]
    }
  }
});
