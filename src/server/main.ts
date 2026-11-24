import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { leesConfig } from './config.ts';
import { ijskastWekker } from './ijskast.ts';
import { dagelijksePing, log, stelHealthcheckIn } from './log.ts';
import type { Ctx } from './context.ts';
import { maakCtx } from './opstart.ts';
import { Proefomgevingen } from './proef.ts';

const config = leesConfig();
const ctx = maakCtx(config);
stelHealthcheckIn(config.healthcheckUrl);
const app = createApp(ctx);
// Staging only. PROEF_SJABLOON: the email address whose proefomgeving new ones copy.
const proef = config.staging ? new Proefomgevingen(ctx, app, process.env.PROEF_SJABLOON || null) : null;

// The built SPA; every other GET falls back to index.html so client-side routes survive a reload. Development serves the client from Vite instead, so a stale build can't shadow it.
const clientDir = path.resolve('dist/client');
if (config.modus !== 'development' && fs.existsSync(clientDir)) {
  const index = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
  const versie = /<meta name="app-versie" content="([^"]+)"/.exec(index)?.[1];
  if (!versie) throw new Error('index.html mist <meta name="app-versie">');
  // Under /api, so the session middleware puts the user on its request log line.
  app.get('/api/versie', (c) => c.json({ versie }, 200, { 'Cache-Control': 'no-store' }));
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), clientDir) }));
  app.get('/*', (c) => c.html(index));
}

function onderhoud(c: Ctx): void {
  const dagGeleden = new Date(c.klok.nu().getTime() - 864e5).toISOString();
  c.db.prepare('DELETE FROM login_pogingen WHERE created_at < ?').run(dagGeleden);
  c.db.prepare('DELETE FROM sessies WHERE expires_at < ?').run(c.klok.iso());
}
function dagelijks(): void {
  onderhoud(ctx);
  if (proef) {
    try {
      proef.ruimOp();
    } catch (e) {
      log.error('opruimen van proefomgevingen mislukt', e);
    }
    proef.voorElke(onderhoud);
  }
  dagelijksePing();
}
dagelijks();
setInterval(dagelijks, 864e5).unref();

function wekker(): void {
  try {
    ijskastWekker(ctx);
  } catch (e) {
    log.error('ijskast-wekker mislukt', e);
  }
  if (proef) proef.voorElke(ijskastWekker);
}
wekker();
setInterval(wekker, 15 * 60e3).unref();

const poort = Number(process.env.PORT ?? 3000);
// HOST is set to 127.0.0.1 in production, behind Caddy; unset listens on every interface.
const server = serve({ fetch: (proef ? proef.app : app).fetch, port: poort, hostname: process.env.HOST }, () => log.info(`${config.modus}: luistert op poort ${poort}, app op ${config.basisUrl}`));

async function stop(): Promise<void> {
  server.close();
  await ctx.pdf.sluit();
  if (proef) proef.sluit();
  ctx.db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
