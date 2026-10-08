import { defineConfig } from 'vite';
import { foundationAliases } from '../../config/foundation-vite-aliases.ts';

export default defineConfig({
  resolve: { alias: foundationAliases },
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rolldownOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'antd',
        'react-hook-form',
        '@foundation/core',
        '@foundation/ui'
      ]
    }
  }
});
