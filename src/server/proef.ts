// Proefomgevingen, staging only: each visitor who signs up at /proberen gets their own copy of the database, as its beheerder, served by the unchanged app (createApp) over its own Ctx. No route or permission knows they exist. See docs/proefomgevingen.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { serialize } from 'hono/utils/cookie';
import { PROEF_BEWAAR_DAGEN, PROEF_MAX, PROEF_PER_UUR, SESSIE_DAGEN } from '../shared/constants.ts';
import { createApp } from './app.ts';
import { type Ctx, type Env, body, fout } from './context.ts';
import { openDb } from './db.ts';
import { log } from './log.ts';
import { type Bericht, EMAIL_RE, type Mailer, escHtml, tekstNaarHtml } from './mail.ts';
import { verzoekLog } from './verzoeklog.ts';

const COOKIE = 'proef';
const ID_RE = /^[0-9a-f]{12}$/;
const UUR_MS = 36e5;

interface Rij {
  id: string;
  email: string; // the owner, confirmed by logging in with the code mailed to it
  naam: string;
  created_at: string;
  laatst_gebruikt_at: string;
}

interface Proef {
  ctx: Ctx;
  app: Hono<Env>;
}

// Every mail from a proefomgeving goes to its owner, with a note naming who would have got it: a visitor can type any address and edit every template. Mail to exactly one of `doorlaten` (the team's feedback addresses) goes out unchanged.
export class DoorstuurMailer implements Mailer {
  private echt: Mailer;
  private eigenaar: string;
  private doorlaten: string[];
  constructor(echt: Mailer, eigenaar: string, doorlaten: string[] = []) {
    this.echt = echt;
    this.eigenaar = eigenaar;
    this.doorlaten = doorlaten.map((a) => a.toLowerCase());
  }
  async verstuur(b: Bericht): Promise<void> {
    const ontvangers = b.cc ? `${b.aan}, cc ${b.cc}` : b.aan;
    const klein = ontvangers.toLowerCase();
    if (klein === this.eigenaar.toLowerCase() || this.doorlaten.includes(klein)) return this.echt.verstuur(b);
    const zin = `Dit is de testomgeving. Op de echte site was deze e-mail verstuurd aan ${ontvangers}.`;
    const html = b.html ?? tekstNaarHtml(b.tekst);
    const opening = /<body[^>]*>/.exec(html);
    if (!opening) throw new Error(`Mail zonder <body>: ${b.onderwerp}`);
    const blok = `<div style="border: 1px solid #f0a500; background: #fff8e6; padding: 8px 12px; margin-bottom: 16px"><em>${escHtml(zin)}</em></div>`;
    const i = opening.index + opening[0].length;
    await this.echt.verstuur({ ...b, aan: this.eigenaar, cc: null, tekst: `[${zin}]\n\n${b.tekst}`, html: html.slice(0, i) + blok + html.slice(i) });
  }
}

export class Proefomgevingen {
  readonly app = new Hono<Env>();
  private hoofd: Ctx;
  private hoofdApp: Hono<Env>;
  private sjabloonEmail: string | null;
  private root: string;
  private register: Database.Database;
  private open = new Map<string, Proef>();

  // sjabloonEmail: the owner of the proefomgeving that new ones copy; without it they start empty.
  constructor(hoofd: Ctx, hoofdApp: Hono<Env>, sjabloonEmail: string | null) {
    if (!hoofd.config.staging) throw new Error('Proefomgevingen alleen op een staging-installatie (STAGING)');
    this.hoofd = hoofd;
    this.hoofdApp = hoofdApp;
    this.sjabloonEmail = sjabloonEmail;
    this.root = path.join(hoofd.config.dataDir, 'proef');
    fs.mkdirSync(this.root, { recursive: true });
    this.register = new Database(path.join(this.root, 'register.db'));
    this.register.pragma('journal_mode = WAL');
    this.register.exec(
      'CREATE TABLE IF NOT EXISTS proefomgevingen (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, naam TEXT NOT NULL, created_at TEXT NOT NULL, laatst_gebruikt_at TEXT NOT NULL)',
    );
    this.routes();
  }

  private routes(): void {
    const a = this.app;
    a.use('/s/*', verzoekLog(this.hoofd));
    a.use('/api/proberen', verzoekLog(this.hoofd));

    // Every link in a proefomgeving's mail starts with /s/<id>: remember the proefomgeving, then open the page. The browser keeps a login link's #token across the redirect.
    a.get('/s/:id/*', (c) => {
      const id = c.req.param('id');
      const url = new URL(c.req.url);
      // Leading slashes and backslashes stripped, so the target can't become //other.site.
      const rest = `/${url.pathname.replace(/^\/s\/[^/]*/, '').replace(/^[/\\]+/, '')}${url.search}`;
      const rij = this.rijVoorId(id);
      c.header('Set-Cookie', this.cookie(rij ? rij.id : null));
      return c.redirect(rest, 302);
    });

    a.post('/api/proberen', async (c) => {
      const b = await body<Record<string, unknown>>(c);
      const naam = typeof b.naam === 'string' ? b.naam.trim() : '';
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      if (!naam || naam.length > 100) fout(400, 'Vul je naam in.');
      if (!EMAIL_RE.test(email)) fout(400, 'Vul een geldig e-mailadres in.');
      // Both are written into JSON text when a sjabloon is copied.
      if (/["\\]/.test(naam + email)) fout(400, 'Gebruik geen aanhalingstekens of backslashes.');
      if (this.hoofd.db.prepare('SELECT 1 FROM gebruikers WHERE email = ? COLLATE NOCASE').get(email)) {
        fout(409, 'Met dit e-mailadres heb je al een account op de testomgeving. Log in via Inloggen.');
      }
      const rij = this.rijVoorEmail(email) ?? this.maak(naam, email);
      const headers = new Headers(c.req.raw.headers);
      headers.delete('content-length');
      const verzoek = new Request(new URL('/api/auth/request', c.req.url), { method: 'POST', headers, body: JSON.stringify({ email }) });
      return this.metCookie(await this.doorsturen(rij, verzoek, c.env), rij.id);
    });

    // The SPA, /health and /api/versie belong to the main app; the API and documents to the proefomgeving in the cookie. A login goes by email address.
    a.all('*', async (c) => {
      const pad = c.req.path;
      if (!((pad.startsWith('/api/') && pad !== '/api/versie') || pad.startsWith('/docs/'))) return this.hoofdApp.fetch(c.req.raw, c.env);
      const cookieRij = this.rijVoorId(getCookie(c, COOKIE));
      if (pad === '/api/auth/request' || pad === '/api/auth/code') {
        const email = await emailUit(c.req.raw);
        if (email !== null) {
          const rij = this.rijVoorLogin(email, cookieRij);
          const res = rij ? await this.doorsturen(rij, c.req.raw, c.env) : await this.hoofdApp.fetch(c.req.raw, c.env);
          return this.metCookie(res, rij ? rij.id : null);
        }
      }
      return cookieRij ? this.doorsturen(cookieRij, c.req.raw, c.env) : this.hoofdApp.fetch(c.req.raw, c.env);
    });

    a.onError((e, c) => {
      if (e instanceof HTTPException) return c.json({ fout: e.message }, e.status);
      log.error(`${c.req.method} ${c.req.path}`, e);
      return c.json({ fout: 'Er ging iets mis op de server. De beheerder is op de hoogte gebracht.' }, 500);
    });
  }

  // The visitor's own proefomgeving; else the one in the cookie, for a klusser the visitor added there; else the main app.
  private rijVoorLogin(email: string, cookieRij: Rij | null): Rij | null {
    const eigen = this.rijVoorEmail(email);
    if (eigen) return eigen;
    if (cookieRij && this.proef(cookieRij).ctx.db.prepare('SELECT 1 FROM gebruikers WHERE email = ? AND archived_at IS NULL').get(email)) return cookieRij;
    return null;
  }

  private async doorsturen(rij: Rij, verzoek: Request, env: unknown): Promise<Response> {
    const res = await this.proef(rij).app.fetch(verzoek, env);
    if (res.status !== 401) {
      const nu = this.hoofd.klok.nu();
      this.register
        .prepare('UPDATE proefomgevingen SET laatst_gebruikt_at = ? WHERE id = ? AND laatst_gebruikt_at < ?')
        .run(nu.toISOString(), rij.id, new Date(nu.getTime() - UUR_MS).toISOString());
    }
    return res;
  }

  private cookie(id: string | null): string {
    const opties = { httpOnly: true, sameSite: 'Lax', secure: this.hoofd.config.modus === 'production', path: '/' } as const;
    return id ? serialize(COOKIE, id, { ...opties, maxAge: SESSIE_DAGEN * 86400 }) : serialize(COOKIE, '', { ...opties, maxAge: 0 });
  }

  private metCookie(res: Response, id: string | null): Response {
    const uit = new Response(res.body, res);
    uit.headers.append('Set-Cookie', this.cookie(id));
    return uit;
  }

  private rijVoorId(id: string | undefined): Rij | null {
    if (!id || !ID_RE.test(id)) return null;
    return (this.register.prepare('SELECT * FROM proefomgevingen WHERE id = ?').get(id) as Rij | undefined) ?? null;
  }

  private rijVoorEmail(email: string): Rij | null {
    return (this.register.prepare('SELECT * FROM proefomgevingen WHERE email = ?').get(email.trim()) as Rij | undefined) ?? null;
  }

  // The only place a path under the proef directory is built; ID_RE keeps it inside.
  private dir(id: string): string {
    if (!ID_RE.test(id)) throw new Error(`Ongeldige proefomgeving-id ${id}`);
    return path.join(this.root, id);
  }

  private proef(rij: Rij): Proef {
    const bestaand = this.open.get(rij.id);
    if (bestaand) return bestaand;
    const dir = this.dir(rij.id);
    const dbPad = path.join(dir, 'app.db');
    if (!fs.existsSync(dbPad)) throw new Error(`Proefomgeving ${rij.id} staat in het register maar ${dbPad} bestaat niet`);
    const config = { ...this.hoofd.config, proefomgeving: true, dataDir: dir, fotoDir: path.join(dir, 'fotos'), basisUrl: `${this.hoofd.config.basisUrl}/s/${rij.id}` };
    const ctx: Ctx = {
      ...this.hoofd,
      db: openDb(dbPad),
      config,
      mailer: new DoorstuurMailer(this.hoofd.mailer, rij.email, this.hoofd.config.feedbackAan),
      verzoek: (regel) => this.hoofd.verzoek(`[proef ${rij.id}] ${regel}`),
    };
    const p = { ctx, app: createApp(ctx) };
    this.open.set(rij.id, p);
    return p;
  }

  private maak(naam: string, email: string): Rij {
    const nu = this.hoofd.klok.nu();
    const tel = (waar: string, ...params: string[]) => (this.register.prepare(`SELECT COUNT(*) AS n FROM proefomgevingen ${waar}`).get(...params) as { n: number }).n;
    if (tel('') >= PROEF_MAX) fout(503, 'Er zijn op dit moment geen proefomgevingen meer beschikbaar.');
    if (tel('WHERE created_at > ?', new Date(nu.getTime() - UUR_MS).toISOString()) >= PROEF_PER_UUR) {
      fout(429, 'Er zijn net heel veel proefomgevingen aangemaakt. Probeer het over een uur opnieuw.');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const dir = this.dir(id);
    fs.mkdirSync(dir);
    try {
      this.vul(dir, naam, email);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    this.register.prepare('INSERT INTO proefomgevingen (id, email, naam, created_at, laatst_gebruikt_at) VALUES (?, ?, ?, ?, ?)').run(id, email, naam, nu.toISOString(), nu.toISOString());
    log.info(`proefomgeving ${id} aangemaakt`);
    return this.rijVoorId(id)!;
  }

  private vul(dir: string, naam: string, email: string): void {
    const dbPad = path.join(dir, 'app.db');
    const fotoDir = path.join(dir, 'fotos');
    // The sjabloon's own owner starts empty, so PROEF_SJABLOON can be set before they sign up.
    const isSjabloon = this.sjabloonEmail !== null && this.sjabloonEmail.toLowerCase() === email.toLowerCase();
    const sjabloon = this.sjabloonEmail && !isSjabloon ? this.rijVoorEmail(this.sjabloonEmail) : null;
    if (this.sjabloonEmail && !isSjabloon && !sjabloon) throw new Error(`PROEF_SJABLOON ${this.sjabloonEmail} heeft geen proefomgeving`);
    if (!sjabloon) {
      const db = openDb(dbPad);
      db.prepare("INSERT INTO gebruikers (naam, email, rol, created_at) VALUES (?, ?, 'beheerder', ?)").run(naam, email, this.hoofd.klok.iso());
      db.close();
      fs.mkdirSync(fotoDir);
      return;
    }
    const bron = this.proef(sjabloon).ctx;
    bron.db.exec(`VACUUM INTO '${dbPad.replaceAll("'", "''")}'`);
    fs.cpSync(bron.config.fotoDir, fotoDir, { recursive: true });
    const db = openDb(dbPad);
    try {
      const eigenaar = db.prepare('SELECT id, naam, email FROM gebruikers WHERE email = ? COLLATE NOCASE').get(sjabloon.email) as Pick<Rij, 'naam' | 'email'> & { id: number } | undefined;
      if (!eigenaar) throw new Error(`De sjabloon-proefomgeving heeft geen gebruiker ${sjabloon.email}`);
      if (db.prepare('SELECT 1 FROM gebruikers WHERE email = ? COLLATE NOCASE AND id != ?').get(email, eigenaar.id)) {
        fout(409, 'Dit e-mailadres hoort bij een voorbeeldgebruiker. Kies een ander adres.');
      }
      db.transaction(() => {
        for (const t of ['sessies', 'login_codes', 'login_pogingen']) db.exec(`DELETE FROM ${t}`);
        // The visitor takes the sjabloon owner's place, also in every text that names them: mail history, audit details, notes.
        vervangOveral(db, eigenaar.email, email);
        vervangOveral(db, eigenaar.naam, naam);
        db.prepare("UPDATE gebruikers SET telefoon = NULL, rol = 'beheerder', archived_at = NULL, last_active_at = NULL, nieuws_gezien = NULL WHERE id = ?").run(eigenaar.id);
      })();
    } finally {
      db.close();
    }
  }

  // For the timers in main.ts. A failing proefomgeving is logged and doesn't stop the others.
  voorElke(taak: (ctx: Ctx) => unknown): void {
    for (const rij of this.register.prepare('SELECT * FROM proefomgevingen').all() as Rij[]) {
      try {
        taak(this.proef(rij).ctx);
      } catch (e) {
        log.error(`proefomgeving ${rij.id}`, e);
      }
    }
  }

  // Deletes each proefomgeving unused for PROEF_BEWAAR_DAGEN, except the sjabloon. Only removes <dataDir>/proef/<registered id>; the live database, <dataDir>/app.db, is outside it.
  ruimOp(): string[] {
    const grens = new Date(this.hoofd.klok.nu().getTime() - PROEF_BEWAAR_DAGEN * 864e5).toISOString();
    const oud = this.register.prepare('SELECT * FROM proefomgevingen WHERE laatst_gebruikt_at < ? AND email != ?').all(grens, this.sjabloonEmail ?? '') as Rij[];
    for (const rij of oud) {
      const p = this.open.get(rij.id);
      if (p) p.ctx.db.close();
      this.open.delete(rij.id);
      fs.rmSync(this.dir(rij.id), { recursive: true, force: true });
      this.register.prepare('DELETE FROM proefomgevingen WHERE id = ?').run(rij.id);
      log.info(`proefomgeving ${rij.id} verwijderd na ${PROEF_BEWAAR_DAGEN} dagen zonder gebruik`);
    }
    return oud.map((r) => r.id);
  }

  sluit(): void {
    for (const p of this.open.values()) p.ctx.db.close();
    this.register.close();
  }
}

async function emailUit(verzoek: Request): Promise<string | null> {
  try {
    const b = (await verzoek.clone().json()) as { email?: unknown };
    return typeof b.email === 'string' ? b.email.trim() : null;
  } catch {
    return null;
  }
}

// Replaces `oud` in every text column of every table.
function vervangOveral(db: Database.Database, oud: string, nieuw: string): void {
  const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  for (const { name } of tabellen) {
    const kolommen = db.pragma(`table_info(${name})`) as { name: string; type: string }[];
    for (const k of kolommen.filter((k) => /TEXT/i.test(k.type))) {
      db.prepare(`UPDATE ${name} SET ${k.name} = REPLACE(${k.name}, ?, ?) WHERE instr(${k.name}, ?) > 0`).run(oud, nieuw, oud);
    }
  }
}
