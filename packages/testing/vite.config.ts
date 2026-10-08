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
  'react/jsx-runtime',
  'react-router',
  'react-router/dom',
  'antd',
  '@tanstack/react-query',
  '@testing-library/react',
  '@foundation/core',
  '@foundation/app',
  '@foundation/security',
  '@foundation/api',
  '@foundation/theme',
  '@foundation/observability'
      ]
    }
  }
});
