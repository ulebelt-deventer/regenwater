import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  root: 'src/client',
  plugins: [solid()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  css: { preprocessorOptions: { scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'] } } },
  server: {
    port: 7425,
    // Prefix match: '/api' without the slash would also proxy the client's own /api.ts module.
    proxy: { '/api/': 'http://localhost:3000', '/docs/': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
});
