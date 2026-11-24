import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { PROEF_PER_UUR } from '../shared/constants.ts';
import { GeheugenMailer } from './mail.ts';
import { DoorstuurMailer, Proefomgevingen } from './proef.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

const SJABLOON = 'sjabloon.beheerder@example.org';

function opzet(sjabloon: string | null = null) {
  const t = testApp();
  t.ctx.config.staging = true;
  const proef = new Proefomgevingen(t.ctx, t.app, sjabloon);
  const klant = () => new Klant({ app: proef.app, mailer: t.mailer });
  return { t, proef, klant };
}

const code = (t: TestApp, email: string) => /\n\n(\d{6})\n\n/.exec(t.mailer.verstuurd.findLast((m) => m.aan === email)!.tekst)![1];

// Signs up at /proberen and types in the mailed code, as a visitor does.
async function aanmelden(t: TestApp, k: Klant, naam: string, email: string): Promise<string> {
  await k.json('POST', '/api/proberen', { naam, email });
  await k.json('POST', '/api/auth/code', { email, code: code(t, email) });
  return k.cookies.get('proef')!;
}

// Every table.column whose text contains `zoek`, ignoring case.
function vindOveral(db: Database.Database, zoek: string): string[] {
  const gevonden: string[] = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
    for (const k of db.pragma(`table_info(${name})`) as { name: string; type: string }[]) {
      if (db.prepare(`SELECT 1 FROM ${name} WHERE ${k.name} LIKE ?`).get(`%${zoek}%`)) gevonden.push(`${name}.${k.name}`);
    }
  }
  return gevonden;
}

const proefDb = (t: TestApp, id: string) => new Database(path.join(t.ctx.config.dataDir, 'proef', id, 'app.db'), { readonly: true });

describe('proefomgevingen', () => {
  it('refuses to start without STAGING', () => {
    const t = testApp();
    expect(() => new Proefomgevingen(t.ctx, t.app, null)).toThrow(/STAGING/);
  });

  it('gives a visitor their own database as its beheerder, without touching the main one', async () => {
    const { t, klant } = opzet();
    const k = klant();
    const id = await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const { ik } = await k.json('GET', '/api/auth/me');
    expect(ik).toMatchObject({ naam: 'Pim Proef', email: 'pim@example.org', rol: 'beheerder' });
    expect(t.ctx.db.prepare('SELECT 1 FROM gebruikers WHERE email = ?').get('pim@example.org')).toBeUndefined();
    expect(fs.existsSync(path.join(t.ctx.config.dataDir, 'proef', id, 'fotos'))).toBe(true);
  });

  it('tells the overzicht it is a proefomgeving, and the main app that it is not', async () => {
    const { t, klant } = opzet();
    const pim = klant();
    await aanmelden(t, pim, 'Pim Proef', 'pim@example.org');
    maakGebruiker(t, 'Team Lid', 'beheerder');
    const team = await new Klant({ app: t.app, mailer: t.mailer }).login('team.lid@example.org');
    expect((await pim.json('GET', '/api/overzicht')).proefomgeving).toBe(true);
    expect((await team.json('GET', '/api/overzicht')).proefomgeving).toBe(false);
  });

  it('keeps each visitor dossiers from the others and from the main app', async () => {
    const { t, klant } = opzet();
    const pim = klant();
    await aanmelden(t, pim, 'Pim Proef', 'pim@example.org');
    await nieuwDossier(pim);
    const sanne = klant();
    await aanmelden(t, sanne, 'Sanne Test', 'sanne@example.org');
    maakGebruiker(t, 'Team Lid', 'beheerder');
    const team = await new Klant({ app: t.app, mailer: t.mailer }).login('team.lid@example.org');
    expect((await pim.json('GET', '/api/dossiers')).totaal).toBe(1);
    expect((await sanne.json('GET', '/api/dossiers')).totaal).toBe(0);
    expect((await team.json('GET', '/api/dossiers')).totaal).toBe(0);
  });

  it('refuses a second sign-up for an address that has a proefomgeving, and logs that address in to it', async () => {
    const { t, klant } = opzet();
    const eerst = await aanmelden(t, klant(), 'Pim Proef', 'pim@example.org');
    const mails = t.mailer.verstuurd.length;
    expect((await klant().json('POST', '/api/proberen', { naam: 'Pim Proef', email: 'PIM@example.org' }, 409)).fout).toBe('Met dit e-mailadres heb je al een proefomgeving.');
    expect(t.mailer.verstuurd).toHaveLength(mails);
    expect(fs.readdirSync(path.join(t.ctx.config.dataDir, 'proef')).filter((f) => /^[0-9a-f]{12}$/.test(f))).toEqual([eerst]);
    const k = klant();
    await k.json('POST', '/api/auth/request', { email: 'pim@example.org' });
    await k.json('POST', '/api/auth/code', { email: 'pim@example.org', code: code(t, 'pim@example.org') });
    expect(k.cookies.get('proef')).toBe(eerst);
  });

  it('copies the sjabloon with the visitor in its owner place, also in texts that named the owner', async () => {
    const { t, klant } = opzet(SJABLOON);
    const eigenaar = klant();
    const sjabloonId = await aanmelden(t, eigenaar, 'Sjabloon Beheerder', SJABLOON);
    const dossier = await nieuwDossier(eigenaar);
    await eigenaar.json('PATCH', `/api/dossiers/${dossier}`, { key: 'notities', value: 'Gebeld door Sjabloon Beheerder (sjabloon.beheerder@example.org)' });
    await eigenaar.json('POST', '/api/gebruikers', { naam: 'Karel Klusser', email: 'karel@example.org', telefoon: '', rol: 'klusser' });

    const k = klant();
    const id = await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    expect(id).not.toBe(sjabloonId);
    expect((await k.json('GET', '/api/dossiers')).totaal).toBe(1);
    const { gebruikers } = await k.json<{ gebruikers: { naam: string; email: string; rol: string }[] }>('GET', '/api/gebruikers');
    expect(gebruikers.map((g) => [g.naam, g.email, g.rol]).sort()).toEqual([
      ['Karel Klusser', 'karel@example.org', 'klusser'],
      ['Pim Proef', 'pim@example.org', 'beheerder'],
    ]);
    const { dossier: d } = await k.json('GET', `/api/dossiers/${dossier}`);
    expect(d.data.notities).toBe('Gebeld door Pim Proef (pim@example.org)');

    const db = proefDb(t, id);
    expect(vindOveral(db, 'sjabloon')).toEqual([]);
    expect((db.prepare('SELECT COUNT(*) AS n FROM sessies').get() as { n: number }).n).toBe(1);
    db.close();
    // The sjabloon itself is unchanged.
    expect((await eigenaar.json('GET', '/api/auth/me')).ik.email).toBe(SJABLOON);
  });

  it('refuses a visitor whose address belongs to an example user in the sjabloon', async () => {
    const { t, klant } = opzet(SJABLOON);
    const eigenaar = klant();
    await aanmelden(t, eigenaar, 'Sjabloon Beheerder', SJABLOON);
    await eigenaar.json('POST', '/api/gebruikers', { naam: 'Karel Klusser', email: 'karel@example.org', telefoon: '', rol: 'klusser' });
    const k = klant();
    await k.json('POST', '/api/proberen', { naam: 'Karel', email: 'karel@example.org' }, 400);
    expect(fs.readdirSync(path.join(t.ctx.config.dataDir, 'proef')).filter((f) => /^[0-9a-f]{12}$/.test(f))).toHaveLength(1);
  });

  it('logs in through the /s/<id> link from the mail on a browser that never saw the proefomgeving', async () => {
    const { t, klant } = opzet();
    const id = await aanmelden(t, klant(), 'Pim Proef', 'pim@example.org');
    await klant().json('POST', '/api/auth/request', { email: 'pim@example.org' });
    const link = /https:\/\/regenton\.test(\/s\/[0-9a-f]{12}\/inloggen\/link)#(\S+)/.exec(t.mailer.verstuurd.at(-1)!.tekst)!;
    expect(link[1]).toBe(`/s/${id}/inloggen/link`);

    const nieuw = klant();
    const res = await nieuw.verzoek('GET', link[1]);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/inloggen/link');
    expect(nieuw.cookies.get('proef')).toBe(id);
    await nieuw.json('POST', '/api/auth/link', { token: link[2] });
    expect((await nieuw.json('GET', '/api/auth/me')).ik.email).toBe('pim@example.org');
  });

  it('redirects /s/ links only within the site and forgets an unknown proefomgeving', async () => {
    const { t, klant } = opzet();
    const k = klant();
    const id = await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    for (const [pad, doel] of [
      [`/s/${id}//evil.example/x`, '/evil.example/x'],
      [`/s/${id}/%5Cevil.example`, '/%5Cevil.example'],
      [`/s/${id}`, '/'],
      [`/s/${id}/dossiers/3?tab=plan`, '/dossiers/3?tab=plan'],
    ]) {
      const res = await k.verzoek('GET', pad);
      expect([pad, res.status, res.headers.get('location')]).toEqual([pad, 302, doel]);
    }
    await k.verzoek('GET', '/s/000000000000/inloggen');
    expect(k.cookies.has('proef')).toBe(false);
  });

  it('refuses sign-up for a team address, and logs the team in to the main app from a browser that has a proefomgeving', async () => {
    const { t, klant } = opzet();
    maakGebruiker(t, 'Team Lid', 'beheerder');
    const k = klant();
    expect((await k.json('POST', '/api/proberen', { naam: 'Team Lid', email: 'team.lid@example.org' }, 409)).fout).toBe('Met dit e-mailadres heb je al een account op de testomgeving.');
    await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    await k.login('team.lid@example.org');
    expect(k.cookies.has('proef')).toBe(false);
    expect((await k.json('GET', '/api/auth/me')).ik.email).toBe('team.lid@example.org');
  });

  it('logs a klusser the visitor added into the visitor proefomgeving, with the code mailed to the visitor', async () => {
    const { t, klant } = opzet();
    const k = klant();
    const id = await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    await k.json('POST', '/api/gebruikers', { naam: 'Karel Klusser', email: 'karel@example.org', telefoon: '', rol: 'klusser' });
    await k.json('POST', '/api/auth/logout');
    await k.json('POST', '/api/auth/request', { email: 'karel@example.org' });
    expect(t.mailer.verstuurd.at(-1)!.tekst).toMatch(/^\[Dit is de testomgeving\. Op de echte site was deze e-mail verstuurd aan karel@example\.org\.\]/);
    await k.json('POST', '/api/auth/code', { email: 'karel@example.org', code: code(t, 'pim@example.org') });
    expect(k.cookies.get('proef')).toBe(id);
    expect((await k.json('GET', '/api/auth/me')).ik).toMatchObject({ email: 'karel@example.org', rol: 'klusser' });
  });

  it('mails feedback from a proefomgeving to the team, unredirected, naming the visitor and the proefomgeving', async () => {
    const { t, klant } = opzet();
    const k = klant();
    const id = await aanmelden(t, k, 'Pim Proef', 'pim@example.org');
    await k.json('POST', '/api/feedback', { tekst: 'Waar vind ik de kaart?', scherm: '/dossiers/1' }, 201);
    const mails = t.mailer.verstuurd.filter((m) => m.onderwerp === 'Feedback van Pim Proef');
    expect(mails.map((m) => m.aan)).toEqual(['feedback1@example.org', 'feedback2@example.org']);
    expect(mails[0].tekst).toMatch(new RegExp(`^Pim Proef \\(pim@example\\.org\\) op https://regenton\\.test/s/${id}/dossiers/1:\\n\\nWaar vind ik de kaart\\?`));
  });

  it('caps new proefomgevingen per hour', async () => {
    const { t, klant } = opzet();
    const register = new Database(path.join(t.ctx.config.dataDir, 'proef', 'register.db'));
    const nu = t.klok.iso();
    for (let i = 0; i < PROEF_PER_UUR; i++) register.prepare('INSERT INTO proefomgevingen VALUES (?, ?, ?, ?, ?)').run(`${i}`.padStart(12, '0'), `p${i}@example.org`, 'P', nu, nu);
    register.close();
    await klant().json('POST', '/api/proberen', { naam: 'Pim Proef', email: 'pim@example.org' }, 429);
    t.klok.verschuif(36e5 + 1);
    await klant().json('POST', '/api/proberen', { naam: 'Pim Proef', email: 'pim@example.org' });
  });

  it('deletes a proefomgeving 90 days after its last use, keeping the sjabloon, recent ones and the main database', async () => {
    const { t, proef, klant } = opzet(SJABLOON);
    const team = maakGebruiker(t, 'Team Lid', 'beheerder');
    const sjabloon = await aanmelden(t, klant(), 'Sjabloon Beheerder', SJABLOON);
    const oud = klant();
    const oudId = await aanmelden(t, oud, 'Pim Proef', 'pim@example.org');
    t.klok.verschuif(89 * 864e5);
    const actief = klant();
    const actiefId = await aanmelden(t, actief, 'Sanne Test', 'sanne@example.org');
    expect(proef.ruimOp()).toEqual([]);
    t.klok.verschuif(2 * 864e5);
    await actief.json('GET', '/api/dossiers');

    expect(proef.ruimOp()).toEqual([oudId]);
    const proefDir = path.join(t.ctx.config.dataDir, 'proef');
    expect(fs.readdirSync(proefDir).filter((f) => /^[0-9a-f]{12}$/.test(f)).sort()).toEqual([sjabloon, actiefId].sort());
    expect(await oud.verzoek('GET', '/api/dossiers')).toHaveProperty('status', 401);
    expect((await actief.json('GET', '/api/dossiers')).totaal).toBe(0);
    expect(t.ctx.db.prepare('SELECT naam FROM gebruikers WHERE id = ?').get(team)).toEqual({ naam: 'Team Lid' });
  });
});

describe('DoorstuurMailer', () => {
  it('sends mail for someone else to the owner, without cc, noting who would have got it', async () => {
    const echt = new GeheugenMailer();
    await new DoorstuurMailer(echt, 'pim@example.org').verstuur({ aan: 'bewoner@example.org', cc: 'team@example.org', replyTo: 'pim@example.org', onderwerp: 'Je afspraak', tekst: 'Tot dinsdag.' });
    const [m] = echt.verstuurd;
    expect(m).toMatchObject({ aan: 'pim@example.org', cc: null, replyTo: 'pim@example.org', onderwerp: 'Je afspraak' });
    expect(m.tekst).toBe('[Dit is de testomgeving. Op de echte site was deze e-mail verstuurd aan bewoner@example.org, cc team@example.org.]\n\nTot dinsdag.');
    expect(m.html).toMatch(/<body[^>]*><div style="border[^"]*"><em>Dit is de testomgeving\. Op de echte site was deze e-mail verstuurd aan bewoner@example\.org, cc team@example\.org\.<\/em><\/div><p>Tot dinsdag\.<\/p>/);
  });

  it('lets mail to exactly one team feedback address through unchanged, and redirects it with a cc', async () => {
    const echt = new GeheugenMailer();
    const mailer = new DoorstuurMailer(echt, 'pim@example.org', ['Team@example.org']);
    const b = { aan: 'team@example.org', onderwerp: 'Feedback van Pim', tekst: 'Mooi' };
    await mailer.verstuur(b);
    await mailer.verstuur({ ...b, cc: 'bewoner@example.org' });
    expect(echt.verstuurd.map((m) => m.aan)).toEqual(['team@example.org', 'pim@example.org']);
    expect(echt.verstuurd[0]).toEqual(b);
  });

  it('sends the owner own mail unchanged', async () => {
    const echt = new GeheugenMailer();
    const b = { aan: 'pim@example.org', onderwerp: 'Je inlogcode', tekst: 'Code' };
    await new DoorstuurMailer(echt, 'pim@example.org').verstuur(b);
    expect(echt.verstuurd).toEqual([b]);
  });
});
