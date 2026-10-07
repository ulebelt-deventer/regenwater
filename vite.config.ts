import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  root: 'src/client',
  plugins: [solid()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  css: { preprocessorOptions: { scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'] } } },
  server: {
    port: 7425,
    // No live reload: a page being tested must not refresh under you. A manual refresh still gets the latest code.
    hmr: false,
    // Prefix match: '/api' without the slash would also proxy the client's own /api.ts module.
    proxy: { '/api/': 'http://localhost:3000', '/docs/': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
});
