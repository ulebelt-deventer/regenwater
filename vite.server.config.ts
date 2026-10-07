import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Bundles the server, including the Solid document components (PDFs, concept-Plan, paper forms), compiled for SSR.
export default defineConfig({
  plugins: [solid({ ssr: true })],
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'node26',
    rollupOptions: { input: { main: 'src/server/main.ts', jobs: 'src/server/jobs.ts' } },
  },
  ssr: { noExternal: ['solid-js'] },
});
