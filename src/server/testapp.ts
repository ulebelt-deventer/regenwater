// An in-memory app for integration tests: real routes and SQLite, fake mail, PDF printer and PDOK.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { createApp } from './app.ts';
import type { Config } from './config.ts';
import type { Ctx, Env } from './context.ts';
import { openDb } from './db.ts';
import { VerstelbareKlok } from './klok.ts';
import { GeheugenMailer } from './mail.ts';
import { fakePdok } from './pdokfake.ts';

import { PDOK_ADRES } from './pdokfake.ts';

export { PDOK_ADRES };

export interface TestApp {
  app: Hono<Env>;
  ctx: Ctx;
  klok: VerstelbareKlok;
  mailer: GeheugenMailer;
  pdfs: string[]; // HTML of every document sent to the printer
}

export function testApp(): TestApp {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regenton-test-'));
  const config: Config = {
    modus: 'test', basisUrl: 'https://regenton.test', dataDir, fotoDir: path.join(dataDir, 'fotos'), emailDir: path.join(dataDir, 'emails'),
    mailgun: null, afzender: 'Test <test@example.org>', healthcheckUrl: null,
  };
  fs.mkdirSync(config.fotoDir);
  const klok = new VerstelbareKlok();
  klok.zet(new Date('2026-03-02T09:00:00.000Z'));
  const mailer = new GeheugenMailer();
  const pdfs: string[] = [];
  const ctx: Ctx = {
    db: openDb(':memory:'), klok, mailer, config,
    haal: async (invoer) => fakePdok(String(invoer)),
    pdf: { print: async (html) => (pdfs.push(html), Buffer.from('%PDF-test')) },
  };
  return { app: createApp(ctx), ctx, klok, mailer, pdfs };
}

export function maakGebruiker(t: TestApp, naam: string, rol: 'beheerder' | 'klusser'): number {
  const email = `${naam.toLowerCase().replace(/\s+/g, '.')}@example.org`;
  return Number(t.ctx.db.prepare('INSERT INTO gebruikers (naam, email, rol, created_at) VALUES (?, ?, ?, ?)').run(naam, email, rol, t.ctx.klok.iso()).lastInsertRowid);
}

// A logged-in browser: keeps the session cookie between requests.
export class Klant {
  private cookie = '';
  private t: TestApp;
  private ip: string;
  constructor(t: TestApp, ip = '10.0.0.1') {
    this.t = t;
    this.ip = ip;
  }

  async verzoek(methode: string, pad: string, inhoud?: unknown, extra: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-forwarded-for': this.ip, cookie: this.cookie };
    let b: BodyInit | undefined;
    if (inhoud instanceof Uint8Array) b = inhoud as BodyInit;
    else if (inhoud !== undefined) {
      headers['content-type'] = 'application/json';
      b = JSON.stringify(inhoud);
    }
    const res = await this.t.app.request(pad, { method: methode, headers, body: b, ...extra });
    const gezet = res.headers.get('set-cookie');
    if (gezet) this.cookie = gezet.split(';')[0];
    return res;
  }

  async json<T = Record<string, any>>(methode: string, pad: string, inhoud?: unknown, status = 200): Promise<T> {
    const res = await this.verzoek(methode, pad, inhoud);
    const tekst = await res.text();
    if (res.status !== status) throw new Error(`${methode} ${pad}: verwacht ${status}, kreeg ${res.status}: ${tekst}`);
    return JSON.parse(tekst) as T;
  }

  // Logs in the way a user does: request a code, read it from the mail, type it in.
  async login(email: string): Promise<this> {
    await this.json('POST', '/api/auth/request', { email });
    const mail = this.t.mailer.verstuurd.findLast((m) => m.aan === email)!;
    const code = /\n\n(\d{6})\n\n/.exec(mail.tekst)![1];
    await this.json('POST', '/api/auth/code', { email, code });
    return this;
  }
}

// A dossier with address, bewoner and huur/koop filled in, made by `beheerder`.
export async function nieuwDossier(beheerder: Klant, huurKoop: 'huur' | 'koop' = 'huur'): Promise<number> {
  const { id } = await beheerder.json<{ id: number }>('POST', '/api/dossiers');
  await beheerder.json('POST', `/api/dossiers/${id}/adres`, { id: PDOK_ADRES.id });
  for (const [key, value] of [['bewoner_naam', 'Anna de Vries'], ['bewoner_email', 'anna@example.org'], ['huur_koop', huurKoop], ['rioolstelsel', 'gemengd']]) {
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
  }
  if (huurKoop === 'huur') await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'woningeigenaar', value: 'Ieder1' });
  return id;
}
