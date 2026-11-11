import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NIEUWS } from '../shared/nieuws.ts';
import { digestTekst, verstuurDigest } from './digest.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier as maakDossier, testApp } from './testapp.ts';

let t: TestApp;
let beheerder: Klant;
let klusserId: number;
let klusser: Klant;

beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  klusserId = maakGebruiker(t, 'Kees Klus', 'klusser');
  beheerder = await new Klant(t).login('bea.beheer@example.org');
  klusser = await new Klant(t).login('kees.klus@example.org');
  t.mailer.verstuurd = [];
});

const nieuwDossier = (huurKoop: 'huur' | 'koop' = 'huur') => maakDossier(beheerder, huurKoop);

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).png().toBuffer();

describe('login and sessions', () => {
  it('logs in with the mailed code and reports who is logged in', async () => {
    const me = await beheerder.json('GET', '/api/auth/me');
    expect(me.ik.naam).toBe('Bea Beheer');
    expect(me.actor).toBeNull();
  });

  it('tells a logged-out client which install this is: none, test when STAGING is set, dev in development even when staging', async () => {
    const omgeving = async () => (await new Klant(t).json('GET', '/api/omgeving')).omgeving;
    expect(await omgeving()).toBeNull();
    t.ctx.config.staging = true;
    expect(await omgeving()).toBe('test');
    t.ctx.config.modus = 'development';
    expect(await omgeving()).toBe('dev');
  });

  it('answers 401 with a Dutch message without a session', async () => {
    const res = await new Klant(t).verzoek('GET', '/api/dossiers');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ fout: 'Niet ingelogd' });
  });

  it('rejects a wrong code and blocks the code after five wrong tries', async () => {
    const k = new Klant(t);
    await k.json('POST', '/api/auth/request', { email: 'kees.klus@example.org' });
    for (let i = 0; i < 4; i++) expect((await k.json('POST', '/api/auth/code', { email: 'kees.klus@example.org', code: '000000x' }, 400)).fout).toMatch(/klopt niet/);
    expect((await k.json('POST', '/api/auth/code', { email: 'kees.klus@example.org', code: '000000x' }, 429)).fout).toMatch(/Te veel pogingen/);
  });

  it('logs out an archived user on their next request', async () => {
    await beheerder.json('POST', `/api/gebruikers/${klusserId}/archiveren`);
    expect((await klusser.verzoek('GET', '/api/dossiers')).status).toBe(401);
  });

  it('shows the app as the klusser while "Inloggen als" is on, and audits the admin as actor', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/auth/als/${klusserId}`);
    expect((await beheerder.json('GET', '/api/auth/me')).ik.naam).toBe('Kees Klus');
    expect((await beheerder.verzoek('GET', `/api/dossiers/${id}`)).status).toBe(404);
    await beheerder.json('POST', '/api/auth/als/stop');
    expect((await beheerder.json('GET', '/api/auth/me')).ik.naam).toBe('Bea Beheer');
  });
});

describe('dossiers', () => {
  it('stores the PDOK address with its parcel box', async () => {
    const id = await nieuwDossier();
    const { dossier } = await beheerder.json('GET', `/api/dossiers/${id}`);
    expect(dossier.adres).toMatchObject({ straat: 'Walstraat', huisnummer: 74, percelen: ['DVT00-E-11907'], perceel_bbox: [207950, 474180, 207980, 474210] });
  });

  it('hides a dossier from a klusser until they are assigned to it', async () => {
    const id = await nieuwDossier();
    expect((await klusser.verzoek('GET', `/api/dossiers/${id}`)).status).toBe(404);
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    const { dossier, gebruikers } = await klusser.json('GET', `/api/dossiers/${id}`);
    expect(dossier.bezoeker_id).toBe(klusserId);
    expect(gebruikers.every((g: Record<string, unknown>) => !('email' in g))).toBe(true);
  });

  it('lets the bezoeker edit visit fields until Klaar voor controle, then refuses', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await klusser.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'Regenton bij de schuur' });
    expect((await klusser.json('PATCH', `/api/dossiers/${id}`, { key: 'bewoner_naam', value: 'X' }, 403)).fout).toMatch(/niet \(meer\) wijzigen/);
    await klusser.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await klusser.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'Toch twee' }, 403);
    expect((await beheerder.json('GET', `/api/dossiers/${id}`)).dossier.data.wensen).toBe('Regenton bij de schuur');
  });

  it("mails the dossier's eigenaar when a klusser taps Klaar voor controle, but not when an admin does", async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await klusser.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    expect(t.mailer.verstuurd.map((m) => [m.aan, m.onderwerp])).toEqual([['bea.beheer@example.org', 'Plan van Aanpak klaar voor controle: Walstraat 74, Deventer (Kees Klus)']]);
    const id2 = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id2}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    expect(t.mailer.verstuurd).toHaveLength(1);
  });

  it('mails the eigenaar just the same when an admin taps Klaar voor controle while "Inloggen als" the klusser', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await beheerder.json('POST', `/api/auth/als/${klusserId}`);
    await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    expect(t.mailer.verstuurd.map((m) => [m.aan, m.onderwerp])).toEqual([['bea.beheer@example.org', 'Plan van Aanpak klaar voor controle: Walstraat 74, Deventer (Kees Klus)']]);
  });

  describe('eigenaar', () => {
    let annaId: number;
    beforeEach(() => {
      annaId = maakGebruiker(t, 'Anna Admin', 'beheerder');
    });

    it('starts as the creator, and once changed the next melding goes to the new eigenaar, logged in Alle activiteit', async () => {
      const id = await nieuwDossier();
      const { dossier } = await beheerder.json('GET', `/api/dossiers/${id}`);
      expect(dossier.eigenaar_id).toBe(dossier.created_by);
      expect((await beheerder.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: annaId })).dossier.eigenaar_id).toBe(annaId);
      await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
      await klusser.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
      expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['anna.admin@example.org']);
      const { items } = await beheerder.json('GET', `/api/dossiers/${id}/activiteit`);
      expect(items.find((i: { type: string }) => i.type === 'eigenaar_gewijzigd').payload).toEqual({ van: 'Bea Beheer', naar: 'Anna Admin' });
    });

    it('accepts only an active beheerder, and only from a beheerder', async () => {
      const id = await nieuwDossier();
      expect((await beheerder.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: klusserId }, 400)).fout).toBe('Kies een actieve beheerder.');
      await beheerder.json('POST', `/api/gebruikers/${annaId}/archiveren`);
      expect((await beheerder.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: annaId }, 400)).fout).toBe('Kies een actieve beheerder.');
      await klusser.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: klusserId }, 403);
    });

    it('refuses to archive or demote an admin who is still eigenaar of an open dossier, and allows it once the dossier is closed', async () => {
      const id = await nieuwDossier();
      await beheerder.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: annaId });
      expect((await beheerder.json('POST', `/api/gebruikers/${annaId}/archiveren`, undefined, 409)).fout).toBe('Anna Admin is nog eigenaar van 1 open dossier. Kies daar eerst een andere eigenaar.');
      await beheerder.json('PATCH', `/api/gebruikers/${annaId}`, { naam: 'Anna Admin', email: 'anna.admin@example.org', telefoon: '', rol: 'klusser' }, 409);
      await beheerder.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });
      expect((await beheerder.json('POST', `/api/gebruikers/${annaId}/archiveren`)).gebruiker.archived_at).not.toBeNull();
    });
  });

  it('merges autosaves by the same person within the hour into one activity item, keeping the first old value', async () => {
    const id = await nieuwDossier();
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'a' });
    t.klok.verschuif(10 * 6e4);
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'ab' });
    const { items } = await beheerder.json('GET', `/api/dossiers/${id}/activiteit`);
    const wensen = items.filter((i: { payload: { changes?: Record<string, unknown> } }) => i.payload.changes && 'wensen' in i.payload.changes);
    expect(wensen).toHaveLength(1);
    expect(wensen[0].payload.changes.wensen).toEqual([null, 'ab']);
  });

  it('makes a closed dossier read-only until it is reopened', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });
    expect((await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'x' }, 409)).fout).toMatch(/gesloten/);
    await beheerder.json('POST', `/api/dossiers/${id}/heropenen`);
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'x' });
  });

  it('exports the list as a semicolon CSV with the address', async () => {
    await nieuwDossier();
    const res = await beheerder.verzoek('GET', '/api/dossiers.csv');
    const tekst = await res.text();
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(tekst.split('\n')[1]).toMatch(/^1;2026-03-02;Walstraat;74;7411GK;Deventer;/);
    expect(tekst.split('\n')[0]).toContain(';');
  });
});

describe('verborgen meldingen', () => {
  const bevindingen = async (id: number) => (await beheerder.json('GET', `/api/dossiers/${id}`)).aandacht.bevindingen as { sleutel: string; tekst: string }[];
  const verberg = (id: number, sleutels: unknown, status = 200) => beheerder.json('POST', `/api/dossiers/${id}/verbergen`, { sleutels }, status);

  it('hides a Klopt niet finding on this dossier for good, logs its text and keeps the others', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    const voor = await bevindingen(id);
    expect(voor.length).toBeGreaterThan(1);
    await verberg(id, [voor[0].sleutel]);
    expect((await bevindingen(id)).map((b) => b.sleutel)).toEqual(voor.slice(1).map((b) => b.sleutel));
    const { items } = await beheerder.json('GET', `/api/dossiers/${id}/activiteit`);
    expect(items[0]).toMatchObject({ type: 'meldingen_verborgen', payload: { meldingen: [voor[0].tekst] } });
    await verberg(id, [voor[0].sleutel]);
    expect((await beheerder.json('GET', `/api/dossiers/${id}/activiteit`)).items[0].id).toBe(items[0].id);
  });

  it('accepts a Plan gewijzigd finding without a note, and warns again after the next plan change', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/mail/plan_corporatie`, { aan: 'ieder1@example.org', onderwerp: 'Plan', tekst: 'Plan' });
    const wijzig = async (wens: string) => {
      t.klok.verschuif(6e4);
      await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: wens });
    };
    await wijzig('Een regenton');
    expect((await bevindingen(id)).map((b) => b.sleutel)).toContain('plan_gewijzigd:corporatie');
    const { dossier } = await verberg(id, ['plan_gewijzigd:corporatie']);
    expect(dossier.plan_acks).toMatchObject([{ ontvanger: 'corporatie', notitie: '' }]);
    expect(dossier.verborgen).toEqual([]);
    expect((await bevindingen(id)).map((b) => b.sleutel)).not.toContain('plan_gewijzigd:corporatie');
    await wijzig('Twee regentonnen');
    expect((await bevindingen(id)).map((b) => b.sleutel)).toContain('plan_gewijzigd:corporatie');
  });

  it('hides the geen dak melding for a beheerder only, and refuses a melding that is not showing', async () => {
    const id = await nieuwDossier();
    expect((await verberg(id, ['geen_dak', 'geen_tuin'])).dossier.verborgen).toEqual(['geen_dak', 'geen_tuin']);
    await verberg(id, ['koop_met_akkoord'], 409);
    await verberg(id, [], 400);
    await verberg(id, 'geen_dak', 400);
    await klusser.json('POST', `/api/dossiers/${id}/verbergen`, { sleutels: ['geen_dak'] }, 403);
  });
});

describe('e-mail', () => {
  it('sends the prefilled subsidiemail and records it on the dossier', async () => {
    const id = await nieuwDossier();
    const voorbeeld = await beheerder.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`);
    expect(voorbeeld.aan).toBe('anna@example.org');
    expect(voorbeeld.tekst).toContain('Beste Anna de Vries,');
    const { dossier } = await beheerder.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: voorbeeld.aan, onderwerp: voorbeeld.onderwerp, tekst: voorbeeld.tekst });
    expect(t.mailer.verstuurd[0]).toMatchObject({ aan: 'anna@example.org', cc: 'bea.beheer@example.org', tekst: voorbeeld.tekst });
    expect(dossier.verzendingen).toHaveLength(1);
  });

  it('attaches the Plan van Aanpak PDF to the plan mail', async () => {
    const id = await nieuwDossier();
    const v = await beheerder.json('GET', `/api/dossiers/${id}/mail/plan_corporatie`);
    await beheerder.json('POST', `/api/dossiers/${id}/mail/plan_corporatie`, { aan: 'ieder1@example.org', onderwerp: v.onderwerp, tekst: v.tekst });
    expect(t.mailer.verstuurd[0].bijlagen!.map((b) => b.naam)).toEqual(['Plan van Aanpak Walstraat 74 Deventer.pdf']);
    expect(t.pdfs[0]).toContain('Walstraat 74');
  });

  it("records a failed send in red, alerts the dossier's eigenaar and answers 502", async () => {
    const id = await nieuwDossier();
    t.mailer.faalVoor = 'anna@example.org';
    const res = await beheerder.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: 'anna@example.org', onderwerp: 'Subsidie', tekst: 'Hallo' }, 502);
    expect(res.fout).toMatch(/kon niet worden verstuurd/);
    const { dossier } = await beheerder.json('GET', `/api/dossiers/${id}`);
    expect(dossier.verzendingen[0].mislukt_at).not.toBeNull();
    expect(t.mailer.verstuurd.map((m) => [m.aan, m.onderwerp])).toEqual([['bea.beheer@example.org', 'E-mail niet afgeleverd: Subsidie aan anna@example.org']]);
  });
});

describe("photos", () => {
  it('uploads, serves and soft-deletes a photo, bumping Plan gewijzigd for a plan slot', async () => {
    const id = await nieuwDossier();
    const { foto, plan_gewijzigd_at } = await beheerder.json('POST', `/api/dossiers/${id}/fotos/straatfoto`, new Uint8Array(await png()), 201);
    expect(plan_gewijzigd_at).not.toBeNull();
    const res = await beheerder.verzoek('GET', `/api/fotos/${foto.id}`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(40);
    await beheerder.json('DELETE', `/api/fotos/${foto.id}`);
    expect((await beheerder.verzoek('GET', `/api/fotos/${foto.id}`)).status).toBe(404);
    expect((await beheerder.json('GET', `/api/dossiers/${id}`)).dossier.fotos).toEqual([]);
  });

  it('rejects a file that is not an image', async () => {
    const id = await nieuwDossier();
    const res = await beheerder.json('POST', `/api/dossiers/${id}/fotos/straatfoto`, new TextEncoder().encode('geen foto'), 400);
    expect(res.fout).toMatch(/geen bruikbare afbeelding/);
  });

  it('stores pijl and tekst annotations and refuses other shapes on an ordinary photo', async () => {
    const id = await nieuwDossier();
    const { foto } = await beheerder.json('POST', `/api/dossiers/${id}/fotos/straatfoto`, new Uint8Array(await png()), 201);
    const pijl = { id: 'a1', type: 'pijl', p: [[1, 2], [10, 12]] };
    await beheerder.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [pijl] });
    expect((await beheerder.json('GET', `/api/dossiers/${id}`)).dossier.fotos[0].annotaties).toEqual([pijl]);
    await beheerder.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [{ id: 'd1', type: 'dak', p: [[0, 0], [1, 0], [1, 1]] }] }, 400);
  });
});

describe('documents', () => {
  it('shows the concept-Plan as HTML with the concept banner and the filled-in fields', async () => {
    const id = await nieuwDossier();
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'Twee regentonnen' });
    const res = await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`);
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('Walstraat 74');
    expect(html).toContain('Twee regentonnen');
    expect(html).toContain('Anna de Vries');
    expect(html).toContain('nog niet ingevuld');
  });

  it('leaves Waar and Hoe with their photos out of the Plan for a regenpijp that stays on the riool, and keeps them for Twijfel', async () => {
    const id = await nieuwDossier();
    const zet = (key: string, value: unknown) => beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
    await zet('kaart_annotaties', [{ id: 'r1', type: 'regenpijp', p: [[1, 1]] }]);
    await zet('regenpijp.r1.waar', 'De border in');
    await zet('regenpijp.r1.hoe', ['holie_molie']);
    await beheerder.json('POST', `/api/dossiers/${id}/fotos/regenpijp.r1.waar`, new Uint8Array(await png()), 201);
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();

    await zet('regenpijp.r1.afkoppelen', 'nee');
    const nee = await plan();
    expect(nee).toContain('Nee (blijft naar riool gaan)');
    expect(nee).not.toContain('De border in');
    expect(nee).not.toContain('Via:');
    expect(nee).not.toContain('>Regenpijp A</figcaption>');

    await zet('regenpijp.r1.afkoppelen', 'twijfel');
    const twijfel = await plan();
    expect(twijfel).toContain('De border in');
    expect(twijfel).toContain('Holie Molie');
    expect(twijfel).toContain('>Regenpijp A</figcaption>');
  });

  it('leaves Ondergrond with its photos out of the Plan unless the regenton is gewenst', async () => {
    const id = await nieuwDossier();
    const zet = (key: string, value: unknown) => beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
    await zet('kaart_annotaties', [{ id: 'r1', type: 'regenpijp', p: [[1, 1]] }]);
    await zet('regenpijp.r1.ondergrond', 'Tegels');
    await beheerder.json('POST', `/api/dossiers/${id}/fotos/regenpijp.r1.ondergrond`, new Uint8Array(await png()), 201);
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();

    await zet('regenpijp.r1.regenton', 'gewenst');
    const gewenst = await plan();
    expect(gewenst).toContain('Ondergrond: <!--$-->Tegels');
    expect(gewenst).toContain('>Regenpijp A</figcaption>');

    await zet('regenpijp.r1.regenton', 'niet');
    const niet = await plan();
    expect(niet).toContain('Niet gewenst');
    expect(niet).not.toContain('Tegels');
    expect(niet).not.toContain('>Regenpijp A</figcaption>');
  });

  it('prints Andere foto’s under its own heading in the Plan, only once there is a photo', async () => {
    const id = await nieuwDossier();
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();
    expect(await plan()).not.toContain('Andere foto’s');
    await beheerder.json('POST', `/api/dossiers/${id}/fotos/andere_fotos`, new Uint8Array(await png()), 201);
    expect(await plan()).toMatch(/>Andere foto’s<\/h3><div[^>]*class="fotos">.*<img /);
  });

  describe('Kosteninschatting in the Plan', () => {
    const zet = (id: number, key: string, value: unknown) => beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
    const plan = async (id: number) => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();
    const metMaterialen = async (huurKoop: 'huur' | 'koop') => {
      const id = await nieuwDossier(huurKoop);
      const { dossier } = await beheerder.json('GET', `/api/dossiers/${id}`);
      const [m1, m2] = dossier.data.materialen;
      for (const [key, value] of [[`materiaal.${m1}.prijs`, 4500], [`materiaal.${m1}.aantal`, 2], [`materiaal.${m2}.prijs`, 2000], [`materiaal.${m2}.aantal`, 1]] as const) await zet(id, key, value);
      return { id, m2 };
    };

    const afkoppelen = async (id: number, waarden: string[]) => {
      await zet(id, 'kaart_annotaties', waarden.map((_, i) => ({ id: `r${i}`, type: 'regenpijp', p: [[i, i]] })));
      for (const [i, w] of waarden.entries()) await zet(id, `regenpijp.r${i}.afkoppelen`, w);
    };
    const totalen = (html: string) => [...html.matchAll(/qa-pdf-totaal-incl[^>]*>([^<]*)</g)].map((m) => m[1]);

    it('totals the materials excl. and incl. btw with the no-guarantee caveat for a koopwoning, and is absent for a huurwoning', async () => {
      const koop = await plan((await metMaterialen('koop')).id);
      expect(koop).toMatch(/qa-pdf-kosteninschatting.*Kosteninschatting.*Zelf uitvoeren.*€ 110,00.*btw 21%.*€ 23,10/);
      expect(totalen(koop)).toEqual(['€ 133,10']);
      expect(koop).toContain('Dit is een prijsinschatting en geen garantie voor de uiteindelijke kosten.');
      expect(koop).not.toContain('Met de Klussendienst');
      expect(koop).not.toContain('qa-pdf-zonder-prijs');
      const huurId = (await metMaterialen('huur')).id;
      await afkoppelen(huurId, ['ja']);
      const huur = await plan(huurId);
      expect(huur).toContain('Materialenlijst');
      expect(huur).not.toContain('Kosteninschatting');
      expect(huur).not.toContain('€');
    });

    it('sets the Klussendienst per regenpijp to afkoppelen beside doing it yourself', async () => {
      const { id } = await metMaterialen('koop');
      await afkoppelen(id, ['ja', 'nee', 'ja']);
      const html = await plan(id);
      expect(html).toMatch(/Zelf uitvoeren.*Met de Klussendienst/);
      expect(html).toMatch(/qa-pdf-klussendienst.*Klussendienst: 2 regenpijpen afkoppelen × € 50,00.*--.*€ 100,00/);
      expect(totalen(html)).toEqual(['€ 133,10', '€ 254,10']);
    });

    it('leaves out a koopwoning without materials or a regenpijp to afkoppelen, and shows the Klussendienst alone without materials', async () => {
      const id = await nieuwDossier('koop');
      expect(await plan(id)).not.toContain('Kosteninschatting');
      await afkoppelen(id, ['ja']);
      expect(totalen(await plan(id))).toEqual(['€ 0,00', '€ 60,50']);
    });

    it('names a listed material without a price, which the total leaves out', async () => {
      const { id, m2 } = await metMaterialen('koop');
      await zet(id, `materiaal.${m2}.naam`, 'Speciaal hulpstuk');
      await zet(id, `materiaal.${m2}.prijs`, null);
      const html = await plan(id);
      expect(html).toContain('€ 90,00');
      expect(html).toMatch(/qa-pdf-zonder-prijs[^<]*>[^<]*Speciaal hulpstuk/);
    });

    it('counts only rows the materials table lists, so a row without a name stays out of the total', async () => {
      const { id, m2 } = await metMaterialen('koop');
      await zet(id, `materiaal.${m2}.naam`, null);
      expect(await plan(id)).toContain('€ 90,00');
    });

    it('flags the Plan as changed when a price changes', async () => {
      const { id, m2 } = await metMaterialen('koop');
      const { plan_gewijzigd_at: voor } = (await beheerder.json('GET', `/api/dossiers/${id}`)).dossier;
      t.klok.verschuif(6e4);
      const { plan_gewijzigd_at: na } = await zet(id, `materiaal.${m2}.prijs`, 2500);
      expect(na > voor).toBe(true);
    });

    it('stays out of the Opleverrapport', async () => {
      const { id } = await metMaterialen('koop');
      await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
      await beheerder.verzoek('GET', `/docs/dossiers/${id}/opleverrapport.pdf`);
      expect(t.pdfs.at(-1)).toContain('Gebruikte materialen');
      expect(t.pdfs.at(-1)).not.toContain('Kosteninschatting');
    });
  });

  it('prints the plan PDF without the concept markers', async () => {
    const id = await nieuwDossier();
    const res = await beheerder.verzoek('GET', `/docs/dossiers/${id}/plan.pdf`);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(await res.text()).toBe('%PDF-test');
    expect(t.pdfs[0]).not.toContain('nog niet ingevuld');
  });

  it('refuses the opleverrapport before the work is opgeleverd', async () => {
    const id = await nieuwDossier();
    expect((await beheerder.verzoek('GET', `/docs/dossiers/${id}/opleverrapport.pdf`)).status).toBe(409);
  });

  it('gives the uitvoeringsspecificatie only to admins, after oplevering, and for koop only with the Klussendienst', async () => {
    const pad = (id: number) => `/docs/dossiers/${id}/uitvoeringsspecificatie`;
    const mijlpaal = (id: number, m: string) => beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: m });
    const koop = await nieuwDossier('koop');
    expect((await beheerder.verzoek('GET', pad(koop))).status).toBe(409);
    await mijlpaal(koop, 'werk_opgeleverd');
    const zelf = await beheerder.verzoek('GET', pad(koop));
    expect(zelf.status).toBe(409);
    expect((await zelf.json()).fout).toMatch(/niet voor de Klussendienst gekozen/);
    await mijlpaal(koop, 'klussendienst_gekozen');
    const html = await (await beheerder.verzoek('GET', pad(koop))).text();
    expect(html).toContain('Klimaatadaptatie Deventer');
    expect(html).toContain('anna@example.org');
    expect(html).toContain('qa-klussendienst');
    expect((await klusser.verzoek('GET', pad(koop))).status).toBe(403);
  });

  it('prints a blank bezoekformulier with the current materials list', async () => {
    await beheerder.json('POST', '/api/materialen', { naam: 'Testmateriaal XL', prijs: 1234 }, 201);
    await beheerder.verzoek('GET', '/docs/bezoekformulier-leeg.pdf');
    expect(t.pdfs[0]).toContain('Testmateriaal XL');
  });

  it('keeps documents behind the login', async () => {
    const id = await nieuwDossier();
    expect((await new Klant(t).verzoek('GET', `/docs/dossiers/${id}/plan.pdf`)).status).toBe(401);
  });
});

describe('beheer', () => {
  it('reorders materials only when the posted ids match the current list', async () => {
    const { materialen } = await beheerder.json('GET', '/api/materialen');
    const ids = materialen.map((m: { id: number }) => m.id);
    const omgekeerd = [...ids].reverse();
    expect((await beheerder.json('PUT', '/api/materialen/volgorde', { ids: omgekeerd })).materialen.map((m: { id: number }) => m.id)).toEqual(omgekeerd);
    await beheerder.json('PUT', '/api/materialen/volgorde', { ids: omgekeerd.slice(1) }, 409);
  });

  it('keeps the materials page for admins only', async () => {
    expect((await klusser.json('GET', '/api/materialen', undefined, 403)).fout).toBe('Alleen voor beheerders');
  });

  it('records the newest Wat is er nieuw datum an admin has seen, for admins only', async () => {
    expect((await beheerder.json('GET', '/api/auth/me')).ik.nieuws_gezien).toBeNull();
    await beheerder.json('POST', '/api/nieuws/gezien');
    expect((await beheerder.json('GET', '/api/auth/me')).ik.nieuws_gezien).toBe(NIEUWS[0].datum);
    expect((await klusser.json('POST', '/api/nieuws/gezien', undefined, 403)).fout).toBe('Alleen voor beheerders');
  });

  it('saves a template with an unknown tag and returns the problem as a warning', async () => {
    const res = await beheerder.json('PUT', '/api/sjablonen/subsidie_huur', { onderwerp: 'Subsidie', tekst: 'Beste {bewonr}' });
    expect(res.problemen.onbekend).toEqual(['bewonr']);
    const { sjablonen } = await beheerder.json('GET', '/api/sjablonen');
    expect(sjablonen.find((s: { key: string }) => s.key === 'subsidie_huur').tekst).toBe('Beste {bewonr}');
  });

  it('mails feedback to every feedback recipient and lists it for admins', async () => {
    await klusser.json('POST', '/api/feedback', { scherm: '/dossiers/1', tekst: 'Knop te klein' }, 201);
    expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['feedback1@example.org', 'feedback2@example.org']);
    expect(t.mailer.verstuurd[0].tekst).toContain('Knop te klein');
    const { feedback } = await beheerder.json('GET', '/api/feedback');
    expect(feedback.map((f: { tekst: string }) => f.tekst)).toEqual(['Knop te klein']);
  });

  it("filters Alle activiteit by a klusser, including what an admin did as them", async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await beheerder.json('POST', `/api/auth/als/${klusserId}`);
    await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'wensen', value: 'als Kees' });
    await beheerder.json('POST', '/api/auth/als/stop');
    const { items } = await beheerder.json('GET', `/api/activiteit?actor=${klusserId}`);
    expect(items.map((i: { type: string }) => i.type)).toEqual(['dossier_gewijzigd']);
  });
});

describe('weekly digest', () => {
  it('lists a stalled inschrijving with its line and the no-activity note, and is empty when nothing needs aandacht', async () => {
    expect(digestTekst(t.ctx)).toBeNull();
    const { id } = await beheerder.json<{ id: number }>('POST', '/api/dossiers');
    t.klok.verschuif(8 * 864e5);
    const m = digestTekst(t.ctx)!;
    expect(m.onderwerp).toBe('Aandacht nodig: 1 dossiers');
    expect(m.tekst).toContain('Ligt stil');
    expect(m.tekst).toContain(`https://regenton.test/dossiers/${id}`);
    expect(m.tekst).toContain('Inschrijving al 8 dagen open');
    expect(m.tekst).toContain('geen activiteit sinds 2 maart 2026');
  });

  it('mails every digest recipient, logging each in the audit trail', async () => {
    await beheerder.json<{ id: number }>('POST', '/api/dossiers');
    t.klok.verschuif(8 * 864e5);
    expect(await verstuurDigest(t.ctx)).toBe(true);
    expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['digest1@example.org', 'digest2@example.org']);
    const rijen = t.ctx.db.prepare("SELECT payload FROM audit WHERE type = 'melding_verstuurd'").all() as { payload: string }[];
    expect(rijen.map((r) => (JSON.parse(r.payload) as { aan: string }).aan)).toEqual(['digest1@example.org', 'digest2@example.org']);
  });

  it('still mails the other recipients when one is refused, and logs no send for the refused one', async () => {
    await beheerder.json<{ id: number }>('POST', '/api/dossiers');
    t.klok.verschuif(8 * 864e5);
    t.mailer.faalVoor = 'digest1@example.org';
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    await verstuurDigest(t.ctx);
    fout.mockRestore();
    expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['digest2@example.org']);
    const rijen = t.ctx.db.prepare("SELECT payload FROM audit WHERE type = 'melding_verstuurd'").all() as { payload: string }[];
    expect(rijen.map((r) => (JSON.parse(r.payload) as { aan: string }).aan)).toEqual(['digest2@example.org']);
  });
});

describe('test-only routes', () => {
  it('exist only in test mode', async () => {
    expect((await new Klant(t).verzoek('POST', '/api/test/klok', { verschuifDagen: 1 })).status).toBe(200);
    t.ctx.config.modus = 'development';
    const { createApp } = await import('./app.ts');
    const res = await createApp(t.ctx).request('/api/test/klok', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' } });
    expect(res.status).toBe(401);
  });
});

describe('request log', () => {
  const id = (email: string) => (t.ctx.db.prepare('SELECT id FROM gebruikers WHERE email = ?').get(email) as { id: number }).id;
  const laatste = () => t.verzoeken.at(-1)!;

  it('logs method, path with query, status, duration, the user and the IP, but not the body', async () => {
    const dossierId = await nieuwDossier();
    t.verzoeken.length = 0;
    await beheerder.json('PATCH', `/api/dossiers/${dossierId}`, { key: 'wensen', value: 'Geheime wens' });
    expect(laatste()).toMatch(new RegExp(`^PATCH /api/dossiers/${dossierId} 200 \\d+ms gebruiker=`));
    await beheerder.json('GET', '/api/dossiers?pagina=2&q=Dorp');
    expect(laatste()).toMatch(new RegExp(`^GET /api/dossiers\\?pagina=2&q=Dorp 200 \\d+ms gebruiker=${id('bea.beheer@example.org')} ip=10\\.0\\.0\\.1$`));
    expect(t.verzoeken.join('\n')).not.toContain('Geheime wens');
  });

  it('logs refused and unknown requests with their status, without a user when not logged in', async () => {
    await new Klant(t, '10.0.0.7').verzoek('GET', '/api/dossiers');
    expect(laatste()).toMatch(/^GET \/api\/dossiers 401 \d+ms ip=10\.0\.0\.7$/);
    await beheerder.verzoek('GET', '/api/bestaat-niet');
    expect(laatste()).toMatch(/^GET \/api\/bestaat-niet 404 /);
  });

  it('names the impersonated klusser next to the admin during "Inloggen als"', async () => {
    await beheerder.json('POST', `/api/auth/als/${klusserId}`);
    await beheerder.json('GET', '/api/auth/me');
    expect(laatste()).toContain(`gebruiker=${id('bea.beheer@example.org')} als=${klusserId} `);
  });

  it('hides a login token or code in the query', async () => {
    await new Klant(t).verzoek('GET', '/inloggen/link?token=abc123&email=x%40example.org');
    expect(laatste()).toMatch(/^GET \/inloggen\/link\?token=\*\*\*&email=x%40example\.org 404 /);
    expect(t.verzoeken.join('\n')).not.toContain('abc123');
  });

  it('skips static files, which follow a logged page load', async () => {
    t.verzoeken.length = 0;
    await new Klant(t).verzoek('GET', '/assets/index-abc.js');
    await new Klant(t).verzoek('GET', '/favicon.ico');
    expect(t.verzoeken).toEqual([]);
  });
});

describe('normafvoer', () => {
  const norm = (id: number) => beheerder.json('GET', `/api/dossiers/${id}`).then((r) => r.dossier.normafvoer);
  const normen = () => beheerder.json('GET', '/api/normafvoeren').then((r) => r.normafvoeren as { id: number; gemeente: string | null; mm: number }[]);
  const voegToe = (gemeente: string, mm: number) => beheerder.json('POST', '/api/normafvoeren', { gemeente, mm });
  const openBezoek = (id: number) => beheerder.json('POST', `/api/dossiers/${id}/bezoek-geopend`);

  it('falls back to the standaard row, and an address in a gemeente with its own row uses that row', async () => {
    const id = await nieuwDossier();
    expect(await norm(id)).toEqual({ mm: 20, gemeente: null, vast_at: null, reden: null });
    await voegToe('Deventer', 10);
    expect(await norm(id)).toEqual({ mm: 10, gemeente: 'Deventer', vast_at: null, reden: null });
  });

  it('fixes the norm when the Bezoek first opens, so later table changes leave the dossier alone but do reach new dossiers', async () => {
    await voegToe('Deventer', 10);
    const id = await nieuwDossier();
    await openBezoek(id);
    const vast = await norm(id);
    expect(vast).toMatchObject({ mm: 10, gemeente: 'Deventer' });
    expect(vast.vast_at).not.toBeNull();

    const rij = (await normen()).find((n) => n.gemeente === 'Deventer')!;
    await beheerder.json('PATCH', `/api/normafvoeren/${rij.id}`, { mm: 15 });
    await openBezoek(id);
    expect(await norm(id)).toEqual(vast);
    expect(await norm(await nieuwDossier())).toMatchObject({ mm: 15, vast_at: null });
  });

  it('logs the fix once on the dossier, however often the Bezoek opens', async () => {
    const id = await nieuwDossier();
    await openBezoek(id);
    await openBezoek(id);
    const { items } = await beheerder.json('GET', `/api/dossiers/${id}/activiteit`);
    expect(items.filter((i: { type: string }) => i.type === 'normafvoer_vastgezet').map((i: { payload: unknown }) => i.payload)).toEqual([{ mm: 20, gemeente: null }]);
  });

  it('fixes the norm at Bezoek afgerond when the opening never reached the server, and keeps it when that is undone', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond' });
    const vast = await norm(id);
    expect(vast.vast_at).not.toBeNull();
    await beheerder.json('PATCH', `/api/normafvoeren/${(await normen())[0].id}`, { mm: 25 });
    await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond', aan: false });
    expect(await norm(id)).toEqual(vast);
  });

  it('leaves a closed dossier unfixed when its Bezoek is opened', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Uitgevoerd', toelichting: 'Test' });
    await openBezoek(id);
    expect((await norm(id)).vast_at).toBeNull();
  });

  it('lets a beheerder override one dossier with a reason, which flags the Plan as changed and fixes the norm; a klusser is refused', async () => {
    const id = await nieuwDossier();
    await klusser.json('POST', `/api/dossiers/${id}/normafvoer`, { mm: 12, reden: 'Klei' }, 403);
    await beheerder.json('POST', `/api/dossiers/${id}/normafvoer`, { mm: 12, reden: '  ' }, 400);
    await beheerder.json('POST', `/api/dossiers/${id}/normafvoer`, { mm: 0, reden: 'Klei' }, 400);
    const { dossier } = await beheerder.json('POST', `/api/dossiers/${id}/normafvoer`, { mm: 12, reden: 'Klei' });
    expect(dossier.normafvoer).toMatchObject({ mm: 12, gemeente: null, reden: 'Klei' });
    expect(dossier.normafvoer.vast_at).not.toBeNull();
    expect(dossier.plan_gewijzigd_at).not.toBeNull();
    await openBezoek(id);
    expect((await norm(id)).mm).toBe(12);
    const { items } = await beheerder.json('GET', `/api/dossiers/${id}/activiteit`);
    expect(items.find((i: { type: string }) => i.type === 'normafvoer_aangepast').payload).toEqual({ oud: 20, nieuw: 12, reden: 'Klei' });
  });

  it('keeps the table to admins, with one row per gemeente and an undeletable standaard row', async () => {
    await klusser.json('GET', '/api/normafvoeren', undefined, 403);
    await klusser.json('POST', '/api/normafvoeren', { gemeente: 'Raalte', mm: 10 }, 403);
    await voegToe('Raalte', 10);
    await beheerder.json('POST', '/api/normafvoeren', { gemeente: 'raalte', mm: 12 }, 409);
    await beheerder.json('POST', '/api/normafvoeren', { gemeente: 'Olst-Wijhe', mm: 0 }, 400);
    await beheerder.json('POST', '/api/normafvoeren', { gemeente: '  ', mm: 10 }, 400);
    const [standaard, raalte] = await normen();
    expect(standaard.gemeente).toBeNull();
    await beheerder.json('DELETE', `/api/normafvoeren/${standaard.id}`, undefined, 400);
    expect((await beheerder.json('DELETE', `/api/normafvoeren/${raalte.id}`)).normafvoeren).toHaveLength(1);
  });

  it('records every table change in the activity log', async () => {
    await voegToe('Raalte', 10);
    const rij = (await normen())[1];
    await beheerder.json('PATCH', `/api/normafvoeren/${rij.id}`, { mm: 12 });
    await beheerder.json('POST', `/api/normafvoeren/${rij.id}/nagekeken`);
    await beheerder.json('DELETE', `/api/normafvoeren/${rij.id}`);
    const { items } = await beheerder.json('GET', '/api/activiteit');
    const eigen = items.filter((i: { type: string }) => i.type.startsWith('normafvoer_')).map((i: { type: string; payload: unknown }) => [i.type, i.payload]);
    expect(eigen).toEqual(expect.arrayContaining([
      ['normafvoer_toegevoegd', { gemeente: 'Raalte', mm: 10 }],
      ['normafvoer_gewijzigd', { gemeente: 'Raalte', oud: 10, nieuw: 12 }],
      ['normafvoer_nagekeken', { gemeente: 'Raalte', mm: 12 }],
      ['normafvoer_verwijderd', { gemeente: 'Raalte', mm: 12 }],
    ]));
  });

  it('offers the gemeenten of existing dossiers and of the riool detection as known names', async () => {
    await nieuwDossier();
    const { gemeenten } = await beheerder.json('GET', '/api/normafvoeren');
    expect(gemeenten).toEqual(expect.arrayContaining(['Deventer', 'Olst-Wijhe', 'Raalte']));
  });

  it('asks in the weekly digest to recheck a norm unchecked for a year, also with no dossiers to report, until it is marked nagekeken', async () => {
    const [standaard] = await normen();
    await beheerder.json('POST', `/api/normafvoeren/${standaard.id}/nagekeken`);
    t.klok.verschuif(364 * 864e5);
    expect(digestTekst(t.ctx)).toBeNull();
    t.klok.verschuif(864e5);
    const m = digestTekst(t.ctx)!;
    expect(m.onderwerp).toBe('Aandacht nodig: normafvoer nakijken');
    expect(m.tekst).toContain('Standaard (overige gemeenten): 20 mm');
    expect(m.tekst).toContain('https://regenton.test/beheer/normafvoer');
    beheerder = await new Klant(t).login('bea.beheer@example.org');
    await beheerder.json('POST', `/api/normafvoeren/${standaard.id}/nagekeken`);
    expect(digestTekst(t.ctx)).toBeNull();
  });

  it('changing a value counts as nagekeken for the digest', async () => {
    const [standaard] = await normen();
    await beheerder.json('PATCH', `/api/normafvoeren/${standaard.id}`, { mm: 20 });
    t.klok.verschuif(365 * 864e5);
    expect(digestTekst(t.ctx)!.onderwerp).toContain('normafvoer');
    beheerder = await new Klant(t).login('bea.beheer@example.org');
    await beheerder.json('PATCH', `/api/normafvoeren/${standaard.id}`, { mm: 21 });
    expect(digestTekst(t.ctx)).toBeNull();
  });
});
