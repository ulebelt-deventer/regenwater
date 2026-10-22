import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// The commit, compiled into the client and stamped into index.html as <meta name="app-versie">; the server reports the one it serves, so an open page can tell it is out of date. deploy.sh refuses uncommitted changes, so a deployed build is never -dirty.
const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
const versie = git('rev-parse --short=12 HEAD') + (git('status --porcelain') ? '-dirty' : '');

export default defineConfig({
  root: 'src/client',
  define: { 'import.meta.env.VITE_APP_VERSIE': JSON.stringify(versie) },
  plugins: [solid(), { name: 'versie', transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-versie', content: versie }, injectTo: 'head' }] }],
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
