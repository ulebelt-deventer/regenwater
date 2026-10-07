// Login edge cases: rate limits, code and link lifetimes, sessions and "Inloggen als".
import { beforeEach, describe, expect, it } from 'vitest';
import { Klant, type TestApp, maakGebruiker, testApp } from './testapp.ts';

let t: TestApp;
let klusserId: number;
const KEES = 'kees.klus@example.org';
const MIN = 6e4;

beforeEach(() => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  klusserId = maakGebruiker(t, 'Kees Klus', 'klusser');
});

const mailsAan = (email: string) => t.mailer.verstuurd.filter((m) => m.aan === email);
const laatsteCode = (email: string) => /\n\n(\d{6})\n\n/.exec(mailsAan(email).at(-1)!.tekst)![1];
const laatsteToken = (email: string) => /#([\w-]+)/.exec(mailsAan(email).at(-1)!.tekst)![1];
const ingelogd = async (k: Klant) => (await k.verzoek('GET', '/api/auth/me')).status === 200;
const geblokkeerd = () =>
  (t.ctx.db.prepare("SELECT payload FROM audit WHERE type = 'login_geblokkeerd' ORDER BY id").all() as { payload: string }[]).map((r) => JSON.parse(r.payload) as Record<string, string>);

describe('requesting a code', () => {
  it('mails a six-digit code and a link with the 15-minute notice', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const [m] = mailsAan(KEES);
    expect(m.onderwerp).toMatch(/^Je inlogcode voor Ulebelt Regenwater: \d{6}$/);
    expect(m.tekst).toContain('https://regenton.test/inloggen/link#');
    expect(m.tekst).toContain('15 minuten geldig');
  });

  it('explains why the mail came and shows the code on its own, centered and monospace, in the HTML part', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const [m] = mailsAan(KEES);
    const intro = 'Je krijgt deze e-mail omdat je inlogt op het Regenwater-portaal van De Ulebelt.';
    expect(m.tekst.startsWith(intro)).toBe(true);
    expect(m.html).toContain(intro);
    const codeBlok = new RegExp(`<p style="([^"]*)">${laatsteCode(KEES)}</p>`).exec(m.html!)![1];
    expect(codeBlok).toContain('text-align: center');
    expect(codeBlok).toContain('monospace');
  });

  it('accepts the address in other capitals and with spaces around it', async () => {
    const k = new Klant(t);
    await k.json('POST', '/api/auth/request', { email: '  Kees.Klus@Example.ORG ' });
    expect(mailsAan(KEES)).toHaveLength(1);
    await k.json('POST', '/api/auth/code', { email: 'KEES.KLUS@example.org', code: ` ${laatsteCode(KEES)} ` });
    expect(await ingelogd(k)).toBe(true);
  });

  it('refuses an unknown address with the contact address and sends nothing', async () => {
    const res = await new Klant(t).json('POST', '/api/auth/request', { email: 'onbekend@example.org' }, 404);
    expect(res.fout).toBe('Dit e-mailadres is niet bekend. Neem contact op met regenwater@ulebelt.nl.');
    expect(t.mailer.verstuurd).toEqual([]);
  });

  it('treats an archived user as unknown', async () => {
    t.ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(t.klok.iso(), klusserId);
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES }, 404);
    expect(t.mailer.verstuurd).toEqual([]);
  });

  it('refuses something that is not an e-mail address', async () => {
    for (const email of ['', 'kees', 42, null]) {
      expect((await new Klant(t).json('POST', '/api/auth/request', { email }, 400)).fout).toBe('Vul een geldig e-mailadres in.');
    }
  });
});

describe('rate limits', () => {
  it('sends at most 5 login mails per address per hour, from any IP, and audits the block', async () => {
    for (let i = 0; i < 5; i++) await new Klant(t, `10.1.0.${i}`).json('POST', '/api/auth/request', { email: KEES });
    const res = await new Klant(t, '10.1.0.9').json('POST', '/api/auth/request', { email: KEES }, 429);
    expect(res.fout).toBe('Te veel pogingen. Wacht een uur en probeer het opnieuw.');
    expect(mailsAan(KEES)).toHaveLength(5);
    expect(geblokkeerd()).toEqual([{ email: KEES, ip: '10.1.0.9', limiet: 'meer dan 5 inlogmails per uur naar dit adres' }]);
  });

  it('counts the mail limit over a sliding hour', async () => {
    const k = new Klant(t);
    for (let i = 0; i < 5; i++) {
      await k.json('POST', '/api/auth/request', { email: KEES });
      t.klok.verschuif(10 * MIN);
    }
    // The first mail was 50 minutes ago: still inside the hour.
    await k.json('POST', '/api/auth/request', { email: KEES }, 429);
    t.klok.verschuif(10 * MIN + 1);
    await k.json('POST', '/api/auth/request', { email: KEES });
    expect(mailsAan(KEES)).toHaveLength(6);
  });

  it('does not let one address use up the mail limit of another', async () => {
    maakGebruiker(t, 'Ria Regen', 'klusser');
    for (let i = 0; i < 5; i++) await new Klant(t, `10.2.0.${i}`).json('POST', '/api/auth/request', { email: KEES });
    await new Klant(t, '10.2.0.9').json('POST', '/api/auth/request', { email: 'ria.regen@example.org' });
    expect(mailsAan('ria.regen@example.org')).toHaveLength(1);
  });

  it('allows 20 attempts per IP per hour, counting unknown addresses and wrong codes, then blocks that IP only', async () => {
    const ip = '10.3.0.1';
    for (let i = 0; i < 10; i++) await new Klant(t, ip).json('POST', '/api/auth/request', { email: `x${i}@example.org` }, 404);
    for (let i = 0; i < 10; i++) await new Klant(t, ip).json('POST', '/api/auth/code', { email: `x${i}@example.org`, code: '123456' }, 400);
    await new Klant(t, ip).json('POST', '/api/auth/request', { email: KEES }, 429);
    expect(t.mailer.verstuurd).toEqual([]);
    expect(geblokkeerd().at(-1)).toEqual({ email: KEES, ip, limiet: 'meer dan 20 pogingen per uur vanaf dit IP-adres' });
    await new Klant(t, '10.3.0.2').json('POST', '/api/auth/request', { email: KEES });
    t.klok.verschuif(60 * MIN);
    await new Klant(t, ip).json('POST', '/api/auth/request', { email: KEES });
  });

  it('also blocks typing a code and following a link from a blocked IP', async () => {
    const ip = '10.4.0.1';
    await new Klant(t, '10.4.0.2').json('POST', '/api/auth/request', { email: KEES });
    for (let i = 0; i < 20; i++) await new Klant(t, ip).json('POST', '/api/auth/code', { email: 'x@example.org', code: '1' }, 400);
    await new Klant(t, ip).json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) }, 429);
    await new Klant(t, ip).json('POST', '/api/auth/link', { token: laatsteToken(KEES) }, 429);
    // The code was not used up by the blocked tries.
    await new Klant(t, '10.4.0.2').json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) });
  });

  it('uses the first address in X-Forwarded-For', async () => {
    for (let i = 0; i < 20; i++) await new Klant(t, `10.5.0.1, 172.16.0.${i}`).json('POST', '/api/auth/code', { email: 'x@example.org', code: '1' }, 400);
    await new Klant(t, '10.5.0.1').json('POST', '/api/auth/code', { email: 'x@example.org', code: '1' }, 429);
  });
});

describe('codes', () => {
  it('works until just before 15 minutes and not after', async () => {
    const k = new Klant(t);
    await k.json('POST', '/api/auth/request', { email: KEES });
    t.klok.verschuif(15 * MIN - 1);
    await k.json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) });

    const k2 = new Klant(t);
    await k2.json('POST', '/api/auth/request', { email: KEES });
    t.klok.verschuif(15 * MIN);
    expect((await k2.json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) }, 400)).fout).toBe('Deze code is niet meer geldig. Vraag een nieuwe code aan.');
    expect(await ingelogd(k2)).toBe(false);
  });

  it('works only once', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const code = laatsteCode(KEES);
    await new Klant(t).json('POST', '/api/auth/code', { email: KEES, code });
    expect((await new Klant(t).json('POST', '/api/auth/code', { email: KEES, code }, 400)).fout).toMatch(/niet meer geldig/);
  });

  it('is voided by requesting a new one, which works', async () => {
    const k = new Klant(t);
    await k.json('POST', '/api/auth/request', { email: KEES });
    const oud = laatsteCode(KEES);
    await k.json('POST', '/api/auth/request', { email: KEES });
    const nieuw = laatsteCode(KEES);
    await k.json('POST', '/api/auth/code', { email: KEES, code: oud }, 400);
    await k.json('POST', '/api/auth/code', { email: KEES, code: nieuw });
    expect(await ingelogd(k)).toBe(true);
  });

  it('is voided after five wrong tries, so even the right code then fails, and the block is audited', async () => {
    const k = new Klant(t);
    await k.json('POST', '/api/auth/request', { email: KEES });
    const goed = laatsteCode(KEES);
    const fout = goed === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await k.json('POST', '/api/auth/code', { email: KEES, code: fout }, 400);
    await k.json('POST', '/api/auth/code', { email: KEES, code: fout }, 429);
    await k.json('POST', '/api/auth/code', { email: KEES, code: goed }, 400);
    expect(geblokkeerd()).toEqual([{ email: KEES, ip: '10.0.0.1', limiet: '5 foute codes' }]);
  });

  it("does not accept one user's code for another user", async () => {
    maakGebruiker(t, 'Ria Regen', 'klusser');
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    await new Klant(t).json('POST', '/api/auth/request', { email: 'ria.regen@example.org' });
    // Codes are random, so this could only fail if both happened to get the same one (one in a million).
    const res = await new Klant(t).json('POST', '/api/auth/code', { email: 'ria.regen@example.org', code: laatsteCode(KEES) }, 400);
    expect(res.fout).toBe('Deze code klopt niet. Probeer het nog eens.');
  });

  it('refuses a code for a user archived after it was mailed', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    t.ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(t.klok.iso(), klusserId);
    const k = new Klant(t);
    await k.json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) }, 400);
    expect(await ingelogd(k)).toBe(false);
  });
});

describe('links', () => {
  it('logs in with the token from the mail, once', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const token = laatsteToken(KEES);
    const k = new Klant(t);
    expect(await k.json('POST', '/api/auth/link', { token })).toEqual({ ok: true, rol: 'klusser' });
    expect(await ingelogd(k)).toBe(true);
    expect((await new Klant(t).json('POST', '/api/auth/link', { token }, 400)).fout).toBe('Deze link is niet meer geldig. Vraag een nieuwe aan.');
  });

  it('shares its one use with the code: typing the code uses up the link', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    await new Klant(t).json('POST', '/api/auth/code', { email: KEES, code: laatsteCode(KEES) });
    await new Klant(t).json('POST', '/api/auth/link', { token: laatsteToken(KEES) }, 400);
  });

  it('expires after 15 minutes and is voided by a newer request', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const verlopen = laatsteToken(KEES);
    t.klok.verschuif(15 * MIN);
    await new Klant(t).json('POST', '/api/auth/link', { token: verlopen }, 400);

    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const vervallen = laatsteToken(KEES);
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    await new Klant(t).json('POST', '/api/auth/link', { token: vervallen }, 400);
    await new Klant(t).json('POST', '/api/auth/link', { token: laatsteToken(KEES) });
  });

  it('refuses the link of a user archived after it was mailed', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    t.ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(t.klok.iso(), klusserId);
    const k = new Klant(t);
    await k.json('POST', '/api/auth/link', { token: laatsteToken(KEES) }, 400);
    expect(await ingelogd(k)).toBe(false);
  });

  it('has no GET route that could use up the token when a mail scanner opens the link', async () => {
    await new Klant(t).json('POST', '/api/auth/request', { email: KEES });
    const token = laatsteToken(KEES);
    const scanner = new Klant(t);
    await scanner.verzoek('GET', `/api/auth/link?token=${token}`);
    await scanner.verzoek('GET', `/inloggen/link#${token}`);
    expect(await ingelogd(scanner)).toBe(false);
    await new Klant(t).json('POST', '/api/auth/link', { token });
  });
});

describe('sessions', () => {
  it('lasts 30 days', async () => {
    const k = await new Klant(t).login(KEES);
    t.klok.verschuif(30 * 864e5 - 1);
    expect(await ingelogd(k)).toBe(true);
    t.klok.verschuif(1);
    expect(await ingelogd(k)).toBe(false);
  });

  it('ends on logout, also for a copy of the cookie', async () => {
    const k = await new Klant(t).login(KEES);
    const kopie = Object.assign(Object.create(Object.getPrototypeOf(k)), k) as Klant;
    await k.json('POST', '/api/auth/logout');
    expect(await ingelogd(k)).toBe(false);
    expect(await ingelogd(kopie)).toBe(false);
  });

  it('keeps sessions on two devices apart: logging out on one keeps the other', async () => {
    const telefoon = await new Klant(t).login(KEES);
    const laptop = await new Klant(t).login(KEES);
    await telefoon.json('POST', '/api/auth/logout');
    expect(await ingelogd(laptop)).toBe(true);
  });

  it('refuses a made-up cookie', async () => {
    const res = await t.app.request('/api/auth/me', { headers: { cookie: 'sessie=verzonnen' } });
    expect(res.status).toBe(401);
  });

  it('records last activity at most every 5 minutes', async () => {
    const k = await new Klant(t).login(KEES);
    const actief = () => (t.ctx.db.prepare('SELECT last_active_at FROM gebruikers WHERE id = ?').get(klusserId) as { last_active_at: string }).last_active_at;
    await k.verzoek('GET', '/api/auth/me');
    const eerst = actief();
    t.klok.verschuif(5 * MIN);
    await k.verzoek('GET', '/api/auth/me');
    expect(actief()).toBe(eerst);
    t.klok.verschuif(1);
    await k.verzoek('GET', '/api/auth/me');
    expect(actief()).toBe(t.klok.iso());
  });
});

describe('Inloggen als', () => {
  it('is for admins only, and only for active klussers', async () => {
    const bea = await new Klant(t).login('bea.beheer@example.org');
    const kees = await new Klant(t).login(KEES);
    const beheerder2 = maakGebruiker(t, 'Bart Beheer', 'beheerder');
    expect((await kees.json('POST', `/api/auth/als/${beheerder2}`, undefined, 403)).fout).toBe('Alleen voor beheerders');
    expect((await bea.json('POST', `/api/auth/als/${beheerder2}`, undefined, 400)).fout).toBe('Inloggen als kan alleen voor actieve klussers.');
    await bea.json('POST', '/api/auth/als/999', undefined, 400);
  });

  it('stops by itself when the klusser is archived meanwhile', async () => {
    const bea = await new Klant(t).login('bea.beheer@example.org');
    await bea.json('POST', `/api/auth/als/${klusserId}`);
    t.ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(t.klok.iso(), klusserId);
    const me = await bea.json('GET', '/api/auth/me');
    expect(me.ik.naam).toBe('Bea Beheer');
    expect(me.actor).toBeNull();
  });

  it('audits start and stop with the klusser, and stopping twice is harmless', async () => {
    const bea = await new Klant(t).login('bea.beheer@example.org');
    await bea.json('POST', `/api/auth/als/${klusserId}`);
    await bea.json('POST', '/api/auth/als/stop');
    await bea.json('POST', '/api/auth/als/stop');
    const rijen = t.ctx.db.prepare("SELECT type, payload FROM audit WHERE type LIKE 'inloggen_als%' ORDER BY id").all() as { type: string; payload: string }[];
    expect(rijen.map((r) => [r.type, JSON.parse(r.payload)])).toEqual([
      ['inloggen_als_start', { gebruiker_id: klusserId, naam: 'Kees Klus' }],
      ['inloggen_als_stop', { gebruiker_id: klusserId, naam: 'Kees Klus' }],
    ]);
  });
});
