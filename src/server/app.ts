import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Gebruiker } from '../shared/types.ts';
import { authRoutes, sessieMiddleware, startSessie } from './auth.ts';
import { type Ctx, type Env, body, fout } from './context.ts';
import { migreer } from './db.ts';
import { documentRoutes } from './documenten/index.tsx';
import { VerstelbareKlok } from './klok.ts';
import { log } from './log.ts';
import { GeheugenMailer } from './mail.ts';
import { OpnemendePrinter } from './pdf.ts';
import { beheerRoutes } from './routes/beheer.ts';
import { dossierRoutes } from './routes/dossiers.ts';
import { fotoRoutes } from './routes/fotos.ts';
import { gebruikerRoutes } from './routes/gebruikers.ts';
import { mailRoutes } from './routes/mail.ts';
import { notificatieRoutes } from './routes/notificaties.ts';
import { verzoekLog } from './verzoeklog.ts';

export function createApp(ctx: Ctx): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', verzoekLog(ctx));

  app.get('/health', (c) => {
    ctx.db.prepare('SELECT 1').get();
    return c.json({ ok: true });
  });

  if (ctx.config.modus === 'test') testRoutes(app, ctx);

  app.use('/api/*', sessieMiddleware(ctx));
  app.use('/docs/*', sessieMiddleware(ctx));
  authRoutes(app, ctx);
  gebruikerRoutes(app, ctx);
  dossierRoutes(app, ctx);
  mailRoutes(app, ctx);
  fotoRoutes(app, ctx);
  beheerRoutes(app, ctx);
  notificatieRoutes(app, ctx);
  documentRoutes(app, ctx);

  app.notFound((c) => c.json({ fout: 'Niet gevonden' }, 404));
  app.onError((e, c) => {
    if (e instanceof HTTPException) return c.json({ fout: e.message }, e.status);
    log.error(`${c.req.method} ${c.req.path}`, e);
    return c.json({ fout: 'Er ging iets mis op de server. De beheerder is op de hoogte gebracht.' }, 500);
  });
  return app;
}

// Registered only when APP_MODUS=test, before the session middleware: they drive the E2E tests.
function testRoutes(app: Hono<Env>, ctx: Ctx): void {
  const klok = () => {
    if (!(ctx.klok instanceof VerstelbareKlok)) throw new Error('Testklok vereist');
    return ctx.klok;
  };
  const mailer = () => {
    if (!(ctx.mailer instanceof GeheugenMailer)) throw new Error('Testmailer vereist');
    return ctx.mailer;
  };
  const printer = () => {
    if (!(ctx.pdf instanceof OpnemendePrinter)) throw new Error('Opnemende printer vereist');
    return ctx.pdf;
  };

  app.post('/api/test/reset', (c) => {
    const tabellen = (ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    ctx.db.pragma('foreign_keys = OFF');
    ctx.db.transaction(() => tabellen.forEach((t) => ctx.db.exec(`DELETE FROM ${t}`)))();
    ctx.db.pragma('foreign_keys = ON');
    migreer(ctx.db);
    klok().reset();
    mailer().verstuurd = [];
    mailer().faalVoor = null;
    printer().html = [];
    return c.json({ ok: true });
  });

  app.post('/api/test/gebruiker', async (c) => {
    const b = await body<{ naam: string; email: string; rol: Gebruiker['rol']; telefoon?: string }>(c);
    const r = ctx.db.prepare('INSERT INTO gebruikers (naam, email, telefoon, rol, created_at) VALUES (?, ?, ?, ?, ?)').run(b.naam, b.email, b.telefoon ?? null, b.rol, ctx.klok.iso());
    return c.json({ id: Number(r.lastInsertRowid) });
  });

  app.post('/api/test/login', async (c) => {
    const { email } = await body<{ email: string }>(c);
    const g = ctx.db.prepare('SELECT * FROM gebruikers WHERE email = ?').get(email) as Gebruiker | undefined;
    if (!g) fout(404, `Geen gebruiker ${email}`);
    startSessie(c, ctx, g);
    return c.json({ ok: true });
  });

  app.post('/api/test/klok', async (c) => {
    const b = await body<{ zet?: string | null; verschuifDagen?: number }>(c);
    if (b.zet !== undefined) klok().zet(b.zet === null ? null : new Date(b.zet));
    if (b.verschuifDagen !== undefined) klok().verschuif(b.verschuifDagen * 864e5);
    return c.json({ nu: ctx.klok.iso() });
  });

  app.get('/api/test/emails', (c) => c.json({ emails: mailer().verstuurd.map((m) => ({ ...m, bijlagen: (m.bijlagen ?? []).map((x) => x.naam) })) }));

  app.get('/api/test/documenten', (c) => c.json({ html: printer().html }));

  app.post('/api/test/mail-faalt', async (c) => {
    const { aan } = await body<{ aan: string | null }>(c);
    mailer().faalVoor = aan;
    return c.json({ ok: true });
  });
}
