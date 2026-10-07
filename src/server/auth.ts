import crypto from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Hono, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  APP_NAAM, LAATST_ACTIEF_INTERVAL_MIN, LOGIN_CODE_GELDIG_MIN, LOGIN_MAILS_PER_ADRES_PER_UUR, LOGIN_MAX_FOUTE_CODES,
  LOGIN_POGINGEN_PER_IP_PER_UUR, SESSIE_DAGEN, ULEBELT_CONTACT_EMAIL,
} from '../shared/constants.ts';
import type { Gebruiker } from '../shared/types.ts';
import { audit } from './audit.ts';
import { type C, type Ctx, type Env, actorVan, body, fout, idParam } from './context.ts';
import { log } from './log.ts';
import { gebruiker } from './repo.ts';

const COOKIE = 'sessie';
const UUR_MS = 36e5;

export const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function ip(c: C): string {
  const doorgestuurd = c.req.header('x-forwarded-for');
  if (doorgestuurd) return doorgestuurd.split(',')[0].trim();
  const adres = getConnInfo(c).remote.address;
  if (!adres) throw new Error('Geen IP-adres voor dit verzoek');
  return adres;
}

function teller(ctx: Ctx, waar: string, ...params: unknown[]): number {
  const sinds = new Date(ctx.klok.nu().getTime() - UUR_MS).toISOString();
  return (ctx.db.prepare(`SELECT COUNT(*) AS n FROM login_pogingen WHERE created_at > ? AND ${waar}`).get(sinds, ...params) as { n: number }).n;
}

function poging(ctx: Ctx, soort: 'aanvraag' | 'code' | 'mail', email: string | null, ipAdres: string): void {
  ctx.db.prepare('INSERT INTO login_pogingen (soort, email, ip, created_at) VALUES (?, ?, ?, ?)').run(soort, email, ipAdres, ctx.klok.iso());
}

function geblokkeerd(ctx: Ctx, email: string, ipAdres: string, limiet: string): never {
  audit(ctx, { id: null, als: null }, null, 'login_geblokkeerd', { email, ip: ipAdres, limiet });
  log.warn(`login geblokkeerd: ${limiet} (${email}, ${ipAdres})`);
  fout(429, 'Te veel pogingen. Wacht een uur en probeer het opnieuw.');
}

function controleerIp(ctx: Ctx, email: string, ipAdres: string): void {
  if (teller(ctx, "soort IN ('aanvraag', 'code') AND ip = ?", ipAdres) >= LOGIN_POGINGEN_PER_IP_PER_UUR) {
    geblokkeerd(ctx, email, ipAdres, `meer dan ${LOGIN_POGINGEN_PER_IP_PER_UUR} pogingen per uur vanaf dit IP-adres`);
  }
}

export function loginMail(code: string, link: string): { onderwerp: string; tekst: string } {
  return {
    onderwerp: `Je inlogcode voor ${APP_NAAM}: ${code}`,
    tekst: `Je inlogcode is:\n\n${code}\n\nOp je telefoon: typ deze code in. Op een computer: klik op de link:\n${link}\n\nDe code en de link zijn ${LOGIN_CODE_GELDIG_MIN} minuten geldig en werken één keer. Heb je niet geprobeerd in te loggen? Dan kun je deze e-mail negeren.`,
  };
}

function actieveGebruiker(ctx: Ctx, email: string): Gebruiker | null {
  return (ctx.db.prepare('SELECT * FROM gebruikers WHERE email = ? AND archived_at IS NULL').get(email.trim()) as Gebruiker | undefined) ?? null;
}

export function startSessie(c: C, ctx: Ctx, g: Gebruiker): void {
  const token = crypto.randomBytes(32).toString('base64url');
  const nu = ctx.klok.nu();
  const verloopt = new Date(nu.getTime() + SESSIE_DAGEN * 864e5);
  ctx.db.prepare('INSERT INTO sessies (token_hash, gebruiker_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hash(token), g.id, nu.toISOString(), verloopt.toISOString());
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: ctx.config.modus === 'production', path: '/', maxAge: SESSIE_DAGEN * 86400 });
}

interface CodeRij {
  id: number;
  gebruiker_id: number;
  code_hash: string;
  expires_at: string;
  foute_pogingen: number;
}

function geldigeCode(ctx: Ctx, gebruikerId: number): CodeRij | null {
  return (
    (ctx.db
      .prepare('SELECT * FROM login_codes WHERE gebruiker_id = ? AND gebruikt_at IS NULL AND vervallen_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1')
      .get(gebruikerId, ctx.klok.iso()) as CodeRij | undefined) ?? null
  );
}

export function authRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.post('/api/auth/request', async (c) => {
    const { email } = await body<{ email: string }>(c);
    if (typeof email !== 'string' || !email.includes('@')) fout(400, 'Vul een geldig e-mailadres in.');
    const ipAdres = ip(c);
    controleerIp(ctx, email, ipAdres);
    poging(ctx, 'aanvraag', email, ipAdres);
    const g = actieveGebruiker(ctx, email);
    if (!g) fout(404, `Dit e-mailadres is niet bekend. Neem contact op met ${ULEBELT_CONTACT_EMAIL}.`);
    if (teller(ctx, "soort = 'mail' AND email = ? COLLATE NOCASE", g.email) >= LOGIN_MAILS_PER_ADRES_PER_UUR) {
      geblokkeerd(ctx, g.email, ipAdres, `meer dan ${LOGIN_MAILS_PER_ADRES_PER_UUR} inlogmails per uur naar dit adres`);
    }
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    const token = crypto.randomBytes(32).toString('base64url');
    const nu = ctx.klok.nu();
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE login_codes SET vervallen_at = ? WHERE gebruiker_id = ? AND gebruikt_at IS NULL AND vervallen_at IS NULL').run(nu.toISOString(), g.id);
      ctx.db
        .prepare('INSERT INTO login_codes (gebruiker_id, code_hash, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(g.id, hash(`${g.id}:${code}`), hash(token), nu.toISOString(), new Date(nu.getTime() + LOGIN_CODE_GELDIG_MIN * 6e4).toISOString());
    })();
    poging(ctx, 'mail', g.email, ipAdres);
    const m = loginMail(code, `${ctx.config.basisUrl}/inloggen/link#${token}`);
    await ctx.mailer.verstuur({ aan: g.email, replyTo: ULEBELT_CONTACT_EMAIL, onderwerp: m.onderwerp, tekst: m.tekst });
    return c.json({ ok: true });
  });

  app.post('/api/auth/code', async (c) => {
    const { email, code } = await body<{ email: string; code: string }>(c);
    if (typeof email !== 'string' || typeof code !== 'string') fout(400, 'Ongeldig verzoek');
    const ipAdres = ip(c);
    controleerIp(ctx, email, ipAdres);
    poging(ctx, 'code', email, ipAdres);
    const g = actieveGebruiker(ctx, email);
    const rij = g ? geldigeCode(ctx, g.id) : null;
    if (!g || !rij) fout(400, 'Deze code is niet meer geldig. Vraag een nieuwe code aan.');
    if (hash(`${g.id}:${code.trim()}`) !== rij.code_hash) {
      const fouten = rij.foute_pogingen + 1;
      ctx.db.prepare('UPDATE login_codes SET foute_pogingen = ? WHERE id = ?').run(fouten, rij.id);
      if (fouten >= LOGIN_MAX_FOUTE_CODES) {
        ctx.db.prepare('UPDATE login_codes SET vervallen_at = ? WHERE id = ?').run(ctx.klok.iso(), rij.id);
        geblokkeerd(ctx, g.email, ipAdres, `${LOGIN_MAX_FOUTE_CODES} foute codes`);
      }
      fout(400, 'Deze code klopt niet. Probeer het nog eens.');
    }
    ctx.db.prepare('UPDATE login_codes SET gebruikt_at = ? WHERE id = ?').run(ctx.klok.iso(), rij.id);
    startSessie(c, ctx, g);
    return c.json({ ok: true, rol: g.rol });
  });

  app.post('/api/auth/link', async (c) => {
    const { token } = await body<{ token: string }>(c);
    if (typeof token !== 'string') fout(400, 'Ongeldig verzoek');
    const ipAdres = ip(c);
    controleerIp(ctx, '', ipAdres);
    poging(ctx, 'code', null, ipAdres);
    const rij = ctx.db
      .prepare('SELECT * FROM login_codes WHERE token_hash = ? AND gebruikt_at IS NULL AND vervallen_at IS NULL AND expires_at > ?')
      .get(hash(token), ctx.klok.iso()) as CodeRij | undefined;
    const g = rij ? gebruiker(ctx.db, rij.gebruiker_id) : null;
    if (!rij || !g || g.archived_at) fout(400, 'Deze link is niet meer geldig. Vraag een nieuwe aan.');
    ctx.db.prepare('UPDATE login_codes SET gebruikt_at = ? WHERE id = ?').run(ctx.klok.iso(), rij.id);
    startSessie(c, ctx, g);
    return c.json({ ok: true, rol: g.rol });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, COOKIE);
    if (token) ctx.db.prepare('DELETE FROM sessies WHERE token_hash = ?').run(hash(token));
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => {
    const ik = c.get('ik');
    const actor = c.get('actor');
    return c.json({ ik, actor: actor.id === ik.id ? null : actor, nu: ctx.klok.iso() });
  });

  // Registered before /als/:id, which would otherwise match "stop".
  app.post('/api/auth/als/stop', (c) => {
    const a = actorVan(c);
    if (a.als === null) return c.json({ ok: true });
    ctx.db.prepare('UPDATE sessies SET impersonated_user_id = NULL WHERE id = ?').run(c.get('sessieId'));
    audit(ctx, { id: a.id, als: null }, null, 'inloggen_als_stop', { gebruiker_id: a.als, naam: c.get('ik').naam });
    return c.json({ ok: true });
  });

  app.post('/api/auth/als/:id', (c) => {
    const actor = c.get('actor');
    if (actor.rol !== 'beheerder') fout(403, 'Alleen voor beheerders');
    const doel = gebruiker(ctx.db, idParam(c));
    if (!doel || doel.rol !== 'klusser' || doel.archived_at) fout(400, 'Inloggen als kan alleen voor actieve klussers.');
    ctx.db.prepare('UPDATE sessies SET impersonated_user_id = ? WHERE id = ?').run(doel.id, c.get('sessieId'));
    audit(ctx, { id: actor.id, als: null }, null, 'inloggen_als_start', { gebruiker_id: doel.id, naam: doel.naam });
    return c.json({ ok: true });
  });
}

const OPEN_ROUTES = new Set(['/api/auth/request', '/api/auth/code', '/api/auth/link', '/api/auth/logout']);

interface SessieRij {
  id: number;
  gebruiker_id: number;
  impersonated_user_id: number | null;
  expires_at: string;
}

// Checks the session and the user's archived flag on every API request, and resolves "Inloggen als".
export function sessieMiddleware(ctx: Ctx): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (OPEN_ROUTES.has(c.req.path)) return next();
    const token = getCookie(c, COOKIE);
    const sessie = token ? (ctx.db.prepare('SELECT * FROM sessies WHERE token_hash = ?').get(hash(token)) as SessieRij | undefined) : undefined;
    const nu = ctx.klok.nu();
    if (!sessie || sessie.expires_at <= nu.toISOString()) fout(401, 'Niet ingelogd');
    const actor = gebruiker(ctx.db, sessie.gebruiker_id)!;
    if (actor.archived_at) fout(401, 'Niet ingelogd');
    let ik = actor;
    if (sessie.impersonated_user_id !== null) {
      const doel = gebruiker(ctx.db, sessie.impersonated_user_id)!;
      if (actor.rol === 'beheerder' && doel.rol === 'klusser' && !doel.archived_at) ik = doel;
      else ctx.db.prepare('UPDATE sessies SET impersonated_user_id = NULL WHERE id = ?').run(sessie.id);
    }
    if (!actor.last_active_at || nu.getTime() - new Date(actor.last_active_at).getTime() > LAATST_ACTIEF_INTERVAL_MIN * 6e4) {
      ctx.db.prepare('UPDATE gebruikers SET last_active_at = ? WHERE id = ?').run(nu.toISOString(), actor.id);
    }
    c.set('actor', actor);
    c.set('ik', ik);
    c.set('sessieId', sessie.id);
    return next();
  };
}

export function alleenBeheerder(c: C): void {
  if (c.get('ik').rol !== 'beheerder') fout(403, 'Alleen voor beheerders');
}
