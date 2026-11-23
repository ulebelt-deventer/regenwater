import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NIEUWS } from '../shared/nieuws.ts';
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

  it("gives the dossier's eigenaar a melding, not a mail, when a klusser taps Klaar voor controle, but not when an admin does", async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await klusser.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    const id2 = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id2}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    expect((await beheerder.json('GET', '/api/notificaties')).items).toEqual([
      expect.objectContaining({ dossier_id: id, adres: 'Walstraat 74, Deventer', titel: 'Klaar voor controle (Kees Klus)', gelezen: false }),
    ]);
    expect(t.mailer.verstuurd).toEqual([]);
  });

  it('gives the eigenaar the melding just the same when an admin taps Klaar voor controle while "Inloggen als" the klusser', async () => {
    const id = await nieuwDossier();
    await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    await beheerder.json('POST', `/api/auth/als/${klusserId}`);
    await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await beheerder.json('POST', '/api/auth/als/stop');
    expect((await beheerder.json('GET', '/api/notificaties')).items.map((n: { titel: string }) => n.titel)).toEqual(['Klaar voor controle (Kees Klus)']);
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
      const anna = await new Klant(t).login('anna.admin@example.org');
      expect((await anna.json('GET', '/api/notificaties')).ongelezen).toBe(1);
      expect((await beheerder.json('GET', '/api/notificaties')).ongelezen).toBe(0);
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

  it('hides the geen dak, regenpijp and tuin meldingen for a beheerder only, and refuses a melding that is not showing', async () => {
    const id = await nieuwDossier();
    expect((await verberg(id, ['geen_dak', 'geen_regenpijp', 'geen_tuin'])).dossier.verborgen).toEqual(['geen_dak', 'geen_regenpijp', 'geen_tuin']);
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

  it("records a failed send in red, gives the dossier's eigenaar a melding and answers 502", async () => {
    const id = await nieuwDossier();
    t.mailer.faalVoor = 'anna@example.org';
    const res = await beheerder.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: 'anna@example.org', onderwerp: 'Subsidie', tekst: 'Hallo' }, 502);
    expect(res.fout).toMatch(/kon niet worden verstuurd/);
    const { dossier } = await beheerder.json('GET', `/api/dossiers/${id}`);
    expect(dossier.verzendingen[0].mislukt_at).not.toBeNull();
    expect((await beheerder.json('GET', '/api/notificaties')).items).toEqual([
      expect.objectContaining({ dossier_id: id, titel: 'E-mail niet afgeleverd aan anna@example.org. Foutmelding: Geweigerd door de provider (test)' }),
    ]);
    expect(t.mailer.verstuurd).toEqual([]);
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

  it('shows only Afkoppelen in the Plan for a regenpijp that stays on the riool, without its other cells, waterberging row or photos, and keeps them all for Twijfel', async () => {
    const id = await nieuwDossier();
    const zet = (key: string, value: unknown) => beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
    await zet('kaart_annotaties', [{ id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] }, { id: 'r1', type: 'regenpijp', p: [[1, 1]] }]);
    await zet('regenpijp.r1.soort', 'zink');
    await zet('regenpijp.r1.diameter', '80');
    await zet('regenpijp.r1.regenton', 'gewenst');
    await zet('regenpijp.r1.ondergrond', 'Tegels');
    await zet('regenpijp.r1.waar', 'De border in');
    await zet('regenpijp.r1.hoe', ['holie_molie']);
    await beheerder.json('POST', `/api/dossiers/${id}/fotos/regenpijp.r1.waar`, new Uint8Array(await png()), 201);
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();

    await zet('regenpijp.r1.afkoppelen', 'nee');
    const nee = await plan();
    expect(nee).toContain('Nee (blijft naar riool gaan)');
    expect(nee).toContain('qa-pdf-op-riool');
    for (const tekst of ['Zink', '80 mm', 'Niet aanwezig, wel gewenst', 'Tegels', 'De border in', 'Via:', 'qa-pdf-waterberging', '>Regenpijp A</figcaption>']) expect(nee).not.toContain(tekst);

    await zet('regenpijp.r1.afkoppelen', 'twijfel');
    const twijfel = await plan();
    for (const tekst of ['Zink', '80 mm', 'Niet aanwezig, wel gewenst', 'Tegels', 'qa-pdf-waterberging']) expect(twijfel).toContain(tekst);
    expect(twijfel).not.toContain('qa-pdf-op-riool');
    expect(twijfel).toContain('De border in');
    expect(twijfel).toContain('Holie Molie');
    expect(twijfel).toContain('>Regenpijp A</figcaption>');
  });

  it('shows a regenpijp’s Opmerking with its photos in the Plan, in the empty cells on Nee and under Waar & hoe otherwise', async () => {
    const id = await nieuwDossier();
    const zet = (key: string, value: unknown) => beheerder.json('PATCH', `/api/dossiers/${id}`, { key, value });
    await zet('kaart_annotaties', [{ id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] }, { id: 'r1', type: 'regenpijp', p: [[1, 1]] }]);
    await zet('regenpijp.r1.opmerking', 'Wordt aangesloten op pijp B');
    await beheerder.json('POST', `/api/dossiers/${id}/fotos/regenpijp.r1.opmerking`, new Uint8Array(await png()), 201);
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();

    await zet('regenpijp.r1.afkoppelen', 'nee');
    const nee = await plan();
    expect(nee).toMatch(/class="qa-pdf-op-riool"[^>]*>Wordt aangesloten op pijp B</);
    expect(nee).toContain('>Regenpijp A</figcaption>');

    await zet('regenpijp.r1.afkoppelen', 'ja');
    const ja = await plan();
    expect(ja).toMatch(/Opmerking: (<!--\$-->)?Wordt aangesloten op pijp B/);
    expect(ja).toContain('>Regenpijp A</figcaption>');
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

  it("links the gemeente's subsidiepagina in the Plan, and leaves the section out of the PDF for a gemeente without one", async () => {
    const id = await nieuwDossier();
    const plan = async () => (await beheerder.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();
    expect(await plan()).toMatch(/6\. Subsidie.*qa-pdf-subsidie.*gemeente.*Deventer.*href="https:\/\/www\.deventer\.nl\/subsidieloket\//);
    t.ctx.db.prepare("UPDATE dossiers SET adres_json = json_set(adres_json, '$.gemeente', 'Zwolle') WHERE id = ?").run(id);
    expect(await plan()).toMatch(/6\. Subsidie.*qa-pdf-subsidie.*nog niet ingevuld/);
    await beheerder.verzoek('GET', `/docs/dossiers/${id}/plan.pdf`);
    expect(t.pdfs[0]).not.toContain('Subsidie');
  });

  describe('Prices in the Plan Materialenlijst', () => {
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

    it('prices each material and totals excl. and incl. btw with the no-guarantee caveat for a koopwoning, and shows no prices for a huurwoning', async () => {
      const koop = await plan((await metMaterialen('koop')).id);
      expect(koop).toMatch(/qa-pdf-kosteninschatting.*€ 45,00.*€ 90,00.*€ 20,00.*€ 20,00.*Totaal excl. btw.*€ 110,00.*btw 21%.*€ 23,10/);
      expect(totalen(koop)).toEqual(['€ 133,10']);
      expect(koop).toContain('Dit is een prijsinschatting en geen garantie voor de uiteindelijke kosten.');
      expect(koop).not.toContain('qa-pdf-zonder-prijs');
      const huurId = (await metMaterialen('huur')).id;
      await afkoppelen(huurId, ['ja']);
      await zet(huurId, 'klussendienst_kosten', 5000);
      const huur = await plan(huurId);
      expect(huur).toContain('Materialenlijst');
      expect(huur).not.toContain('qa-pdf-kosteninschatting');
      expect(huur).not.toContain('€');
    });

    it('adds the agreed Klussendienst amount below the materials and to the totals, in whole cents', async () => {
      const { id } = await metMaterialen('koop');
      expect(await plan(id)).toMatch(/qa-pdf-klussendienst.*Uitvoering door de Klussendienst.*nog niet ingevuld/);
      await zet(id, 'klussendienst_kosten', 10000);
      const html = await plan(id);
      expect(html).toMatch(/€ 20,00.*qa-pdf-klussendienst.*Uitvoering door de Klussendienst.*€ 100,00.*Totaal excl. btw.*€ 210,00/);
      expect(totalen(html)).toEqual(['€ 254,10']);
      expect((await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'klussendienst_kosten', value: 12.5 }, 400)).fout).toMatch(/Afgesproken kosten Klussendienst/);
    });

    it('prefills the agreed amount at Bezoek afgerond with € 50 per afgekoppelde regenpijp for koop only, and keeps an amount already agreed', async () => {
      const bezoekAf = (id: number, aan: boolean) => beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond', aan });
      const kosten = async (id: number) => (await beheerder.json('GET', `/api/dossiers/${id}`)).dossier.data.klussendienst_kosten;
      const koop = await nieuwDossier('koop');
      await afkoppelen(koop, ['ja', 'nee', 'ja']);
      await bezoekAf(koop, true);
      expect(await kosten(koop)).toBe(10000);
      await bezoekAf(koop, false);
      await zet(koop, 'klussendienst_kosten', 7500);
      await bezoekAf(koop, true);
      expect(await kosten(koop)).toBe(7500);
      const huur = await nieuwDossier('huur');
      await afkoppelen(huur, ['ja']);
      await bezoekAf(huur, true);
      expect(await kosten(huur)).toBeUndefined();
    });

    it('leaves out a koopwoning without materials or a Klussendienst amount, and shows the Klussendienst alone without materials', async () => {
      const id = await nieuwDossier('koop');
      expect(await plan(id)).not.toContain('qa-pdf-kosteninschatting');
      await zet(id, 'klussendienst_kosten', 0);
      expect(await plan(id)).not.toContain('qa-pdf-kosteninschatting');
      await zet(id, 'klussendienst_kosten', 5000);
      expect(totalen(await plan(id))).toEqual(['€ 60,50']);
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

    it('flags the Plan as changed when the Klussendienst amount changes for a koopwoning only, whose Plan shows it', async () => {
      for (const huurKoop of ['huur', 'koop'] as const) {
        const { id } = await metMaterialen(huurKoop);
        const { plan_gewijzigd_at: voor } = (await beheerder.json('GET', `/api/dossiers/${id}`)).dossier;
        t.klok.verschuif(6e4);
        const { plan_gewijzigd_at: na } = await zet(id, 'klussendienst_kosten', 7500);
        expect(na > voor).toBe(huurKoop === 'koop');
      }
    });

    it('flags the Plan as changed when a price changes', async () => {
      const { id, m2 } = await metMaterialen('koop');
      const { plan_gewijzigd_at: voor } = (await beheerder.json('GET', `/api/dossiers/${id}`)).dossier;
      t.klok.verschuif(6e4);
      const { plan_gewijzigd_at: na } = await zet(id, `materiaal.${m2}.prijs`, 2500);
      expect(na > voor).toBe(true);
    });

    it('prices the Gebruikte materialen with the agreed Klussendienst amount in the Opleverrapport of a koopwoning, without the inschatting caveat, and shows no prices for a huurwoning', async () => {
      const rapport = async (huurKoop: 'huur' | 'koop') => {
        const { id } = await metMaterialen(huurKoop);
        await beheerder.json('POST', `/api/dossiers/${id}/gebruikt-vullen`);
        await zet(id, 'klussendienst_kosten', 12550);
        await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
        await beheerder.verzoek('GET', `/docs/dossiers/${id}/opleverrapport.pdf`);
        return t.pdfs.at(-1)!;
      };
      const koop = await rapport('koop');
      expect(koop).toMatch(/Gebruikte materialen.*qa-pdf-kosteninschatting.*€ 45,00.*€ 90,00.*€ 20,00.*qa-pdf-klussendienst.*Uitvoering door de Klussendienst.*€ 125,50.*Totaal excl. btw.*€ 235,50/);
      expect(totalen(koop)).toEqual(['€ 284,96']);
      expect(koop).not.toContain('qa-pdf-geen-garantie');
      const huur = await rapport('huur');
      expect(huur).toContain('Gebruikte materialen');
      expect(huur).not.toContain('qa-pdf-kosteninschatting');
      expect(huur).not.toContain('€');
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

  describe('Afgekoppeld? per regenpijp', () => {
    const pijpen = async (id: number) => {
      await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'kaart_annotaties', value: ['a', 'b', 'c'].map((r, i) => ({ id: r, type: 'regenpijp', p: [[i, i]] })) });
      for (const [r, afkoppelen] of [['a', 'ja'], ['b', 'twijfel'], ['c', 'nee']]) await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: `regenpijp.${r}.afkoppelen`, value: afkoppelen });
    };

    it('needs an answer from the uitvoerder for every regenpijp on Ja or Twijfel before Werk opgeleverd, and none on Nee', async () => {
      const id = await nieuwDossier();
      await pijpen(id);
      await beheerder.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: klusserId });
      const opleveren = (status: number) => klusser.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' }, status);
      expect((await opleveren(400)).fout).toBe('Vul eerst bij regenpijp A, B in of hij is afgekoppeld.');
      await klusser.json('PATCH', `/api/dossiers/${id}`, { key: 'regenpijp.a.afgekoppeld', value: 'ja' });
      expect((await opleveren(400)).fout).toBe('Vul eerst bij regenpijp B in of hij is afgekoppeld.');
      await klusser.json('PATCH', `/api/dossiers/${id}`, { key: 'regenpijp.b.afgekoppeld', value: 'nee' });
      expect((await opleveren(200)).dossier.werk_opgeleverd_at).not.toBeNull();
    });

    it('lists the answers in the Opleverrapport, with (onbekend) for a regenpijp opgeleverd without one', async () => {
      const id = await nieuwDossier();
      await pijpen(id);
      await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'regenpijp.a.afgekoppeld', value: 'nee' });
      await beheerder.json('PATCH', `/api/dossiers/${id}`, { key: 'regenpijp.b.afgekoppeld', value: 'ja' });
      await beheerder.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
      // A dossier opgeleverd before the question existed.
      t.ctx.db.prepare("UPDATE dossiers SET data = json_remove(data, '$.\"regenpijp.b.afgekoppeld\"') WHERE id = ?").run(id);
      await beheerder.verzoek('GET', `/docs/dossiers/${id}/opleverrapport.pdf`);
      const rapport = t.pdfs.at(-1)!;
      expect(rapport).toMatch(/qa-pdf-afgekoppeld.*<td>A<\/td><td>Ja<\/td><td>Nee<\/td>.*<td>B<\/td><td>Twijfel<\/td><td>\(onbekend\)<\/td>/);
      expect(rapport).not.toMatch(/<td>C<\/td>/);
    });
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
    await beheerder.json('PATCH', `/api/dossiers/${koop}`, { key: 'klussendienst_kosten', value: 7500 });
    const html = await (await beheerder.verzoek('GET', pad(koop))).text();
    expect(html).toContain('Klimaatadaptatie Deventer');
    expect(html).toContain('anna@example.org');
    expect(html).toMatch(/qa-klussendienst.*afgesproken in het Plan van Aanpak.*€ 75,00.*Totaal excl. btw.*qa-subtotaal.*€ 75,00.*qa-btw.*€ 15,75.*Totaal incl. btw.*qa-totaal.*€ 90,75/);
    expect((await klusser.verzoek('GET', pad(koop))).status).toBe(403);
  });

  it('leaves the Klussendienst off the uitvoeringsspecificatie for huur', async () => {
    const huur = await nieuwDossier('huur');
    await beheerder.json('PATCH', `/api/dossiers/${huur}`, { key: 'klussendienst_kosten', value: 7500 });
    await beheerder.json('POST', `/api/dossiers/${huur}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    const html = await (await beheerder.verzoek('GET', `/docs/dossiers/${huur}/uitvoeringsspecificatie`)).text();
    expect(html).toContain('qa-subtotaal');
    expect(html).not.toContain('Klussendienst');
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

  it('mails feedback to every feedback recipient with no Reply-To, logging each in the audit trail, and lists it for admins', async () => {
    await klusser.json('POST', '/api/feedback', { scherm: '/dossiers/1', tekst: 'Knop te klein' }, 201);
    expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['feedback1@example.org', 'feedback2@example.org']);
    expect(t.mailer.verstuurd[0].replyTo).toBeUndefined();
    expect(t.mailer.verstuurd[0].tekst).toContain('Knop te klein');
    const rijen = t.ctx.db.prepare("SELECT payload FROM audit WHERE type = 'melding_verstuurd'").all() as { payload: string }[];
    expect(rijen.map((r) => (JSON.parse(r.payload) as { aan: string }).aan)).toEqual(['feedback1@example.org', 'feedback2@example.org']);
    const { feedback } = await beheerder.json('GET', '/api/feedback');
    expect(feedback.map((f: { tekst: string }) => f.tekst)).toEqual(['Knop te klein']);
  });

  it('still mails the other feedback recipients when one is refused, and logs no send for the refused one', async () => {
    t.mailer.faalVoor = 'feedback1@example.org';
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    await klusser.json('POST', '/api/feedback', { scherm: '/', tekst: 'Hoi' }, 201);
    fout.mockRestore();
    expect(t.mailer.verstuurd.map((m) => m.aan)).toEqual(['feedback2@example.org']);
    const rijen = t.ctx.db.prepare("SELECT payload FROM audit WHERE type = 'melding_verstuurd'").all() as { payload: string }[];
    expect(rijen.map((r) => (JSON.parse(r.payload) as { aan: string }).aan)).toEqual(['feedback2@example.org']);
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

  // A fresh login each time: the session would not last the year.
  const nakijken = async () => (await (await new Klant(t).login('bea.beheer@example.org')).json('GET', '/api/overzicht')).normNakijken as { gemeente: string | null; mm: number }[];

  it('asks on the Overzicht to recheck a norm unchecked for a year, until it is marked nagekeken', async () => {
    const [standaard] = await normen();
    await beheerder.json('POST', `/api/normafvoeren/${standaard.id}/nagekeken`);
    t.klok.verschuif(364 * 864e5);
    expect(await nakijken()).toEqual([]);
    t.klok.verschuif(864e5);
    expect(await nakijken()).toEqual([expect.objectContaining({ id: standaard.id, gemeente: null, mm: 20 })]);
    beheerder = await new Klant(t).login('bea.beheer@example.org');
    await beheerder.json('POST', `/api/normafvoeren/${standaard.id}/nagekeken`);
    expect(await nakijken()).toEqual([]);
  });

  it('changing a value counts as nagekeken for the Overzicht', async () => {
    const [standaard] = await normen();
    await beheerder.json('PATCH', `/api/normafvoeren/${standaard.id}`, { mm: 20 });
    t.klok.verschuif(365 * 864e5);
    expect(await nakijken()).toHaveLength(1);
    beheerder = await new Klant(t).login('bea.beheer@example.org');
    await beheerder.json('PATCH', `/api/normafvoeren/${standaard.id}`, { mm: 21 });
    expect(await nakijken()).toEqual([]);
  });
});
