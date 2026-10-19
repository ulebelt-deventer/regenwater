// Autosave edge cases: concurrent editors, value validation, and how edits merge in Alle activiteit.
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { Klant, PDOK_ADRES, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

let t: TestApp;
let bea: Klant;
let bart: Klant;
let kees: Klant;
let keesId: number;
let id: number;
const MIN = 6e4;

beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  maakGebruiker(t, 'Bart Beheer', 'beheerder');
  keesId = maakGebruiker(t, 'Kees Klus', 'klusser');
  bea = await new Klant(t).login('bea.beheer@example.org');
  bart = await new Klant(t).login('bart.beheer@example.org');
  kees = await new Klant(t).login('kees.klus@example.org');
  id = await nieuwDossier(bea);
  await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
  t.klok.verschuif(2 * 60 * MIN); // past the merge window of the setup edits
});

const zet = (k: Klant, key: string, value: unknown, status = 200) => k.json('PATCH', `/api/dossiers/${id}`, { key, value }, status);
const data = async () => (await bea.json('GET', `/api/dossiers/${id}`)).dossier.data as Record<string, unknown>;

interface Item {
  type: string;
  actor_id: number;
  impersonated_user_id: number | null;
  payload: { changes?: Record<string, [unknown, unknown]> };
}
// Alle activiteit for the dossier, oldest first, from the given audit id on.
async function items(vanaf = 0): Promise<Item[]> {
  const { items } = await bea.json<{ items: (Item & { id: number })[] }>('GET', `/api/dossiers/${id}/activiteit`);
  return items.filter((i) => i.id > vanaf).reverse();
}
const laatsteId = () => (t.ctx.db.prepare('SELECT MAX(id) AS n FROM audit').get() as { n: number }).n;
const wijzigingen = (i: Item[]) => i.filter((x) => x.type === 'dossier_gewijzigd').map((x) => x.payload.changes);

describe('two people editing the same dossier', () => {
  it('keeps both fields when two saves of different fields arrive at the same moment', async () => {
    await Promise.all([zet(bea, 'wensen', 'Twee tonnen'), zet(kees, 'tuinsituatie', 'Groot gazon'), zet(bart, 'notities', 'Bel eerst')]);
    expect(await data()).toMatchObject({ wensen: 'Twee tonnen', tuinsituatie: 'Groot gazon', notities: 'Bel eerst' });
  });

  it('keeps every row when many saves hit the same dossier at once', async () => {
    const keys = ['wensen', 'tuinsituatie', 'hoosbuien', 'notities', 'beoordeling_toelichting', 'bewoner_doet', 'ulebelt_doet'];
    await Promise.all(keys.map((k, i) => zet(i % 2 ? kees : bea, k, `waarde ${i}`)));
    const d = await data();
    expect(keys.map((k) => d[k])).toEqual(keys.map((_, i) => `waarde ${i}`));
  });

  it('lets the last save of the same field win and logs each person separately', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'Van Bea');
    await zet(kees, 'wensen', 'Van Kees');
    expect((await data()).wensen).toBe('Van Kees');
    expect(wijzigingen(await items(vanaf))).toEqual([{ wensen: [null, 'Van Bea'] }, { wensen: ['Van Bea', 'Van Kees'] }]);
  });

  it('does not touch the activity or Plan gewijzigd when a save does not change the value', async () => {
    await zet(bea, 'wensen', 'Zelfde');
    t.klok.verschuif(2 * 60 * MIN);
    const vanaf = laatsteId();
    const voor = (await bea.json('GET', `/api/dossiers/${id}`)).dossier.plan_gewijzigd_at;
    const res = await zet(bart, 'wensen', 'Zelfde');
    expect(res.plan_gewijzigd_at).toBe(voor);
    expect(await items(vanaf)).toEqual([]);
  });
});

describe('merging edits in Alle activiteit', () => {
  it('merges different fields by one person into one item', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    await zet(bea, 'hoosbuien', 'b');
    expect(wijzigingen(await items(vanaf))).toEqual([{ wensen: [null, 'a'], hoosbuien: [null, 'b'] }]);
  });

  it('merges up to just under an hour after the first save of the item, not an hour after the last', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    t.klok.verschuif(30 * MIN);
    await zet(bea, 'wensen', 'ab');
    t.klok.verschuif(30 * MIN - 1);
    await zet(bea, 'wensen', 'abc');
    t.klok.verschuif(1);
    await zet(bea, 'wensen', 'abcd');
    expect(wijzigingen(await items(vanaf))).toEqual([{ wensen: [null, 'abc'] }, { wensen: ['abc', 'abcd'] }]);
  });

  it("starts a new item after another person's edit, also when the first person continues", async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    await zet(kees, 'tuinsituatie', 'b');
    await zet(bea, 'wensen', 'ac');
    expect(wijzigingen(await items(vanaf))).toEqual([{ wensen: [null, 'a'] }, { tuinsituatie: [null, 'b'] }, { wensen: ['a', 'ac'] }]);
  });

  it('starts a new item after a milestone', async () => {
    const vanaf = laatsteId();
    await zet(kees, 'wensen', 'a');
    await kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond' });
    await zet(kees, 'wensen', 'ab');
    expect((await items(vanaf)).map((i) => i.type)).toEqual(['dossier_gewijzigd', 'mijlpaal', 'dossier_gewijzigd']);
  });

  it('starts a new item after an e-mail is sent', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    const v = await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`);
    await bea.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: v.aan, onderwerp: v.onderwerp, tekst: v.tekst });
    await zet(bea, 'wensen', 'ab');
    expect((await items(vanaf)).map((i) => i.type)).toEqual(['dossier_gewijzigd', 'email_verstuurd', 'dossier_gewijzigd']);
  });

  it('keeps what an admin did as a klusser apart from what they did as themselves', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'als Bea');
    await bea.json('POST', `/api/auth/als/${keesId}`);
    await zet(bea, 'tuinsituatie', 'als Kees');
    await bea.json('POST', '/api/auth/als/stop');
    const i = (await items(vanaf)).filter((x) => x.type === 'dossier_gewijzigd');
    expect(i.map((x) => [x.impersonated_user_id, x.payload.changes])).toEqual([[null, { wensen: [null, 'als Bea'] }], [keesId, { tuinsituatie: [null, 'als Kees'] }]]);
  });

  it('drops a field that was changed back, and the whole item when nothing is left', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    await zet(bea, 'hoosbuien', 'b');
    await zet(bea, 'wensen', null);
    expect(wijzigingen(await items(vanaf))).toEqual([{ hoosbuien: [null, 'b'] }]);
    await zet(bea, 'hoosbuien', null);
    expect(await items(vanaf)).toEqual([]);
  });

  it('merges a photo upload with field edits by the same person', async () => {
    const vanaf = laatsteId();
    await zet(bea, 'tuinsituatie', 'a');
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer();
    const { foto } = await bea.json('POST', `/api/dossiers/${id}/fotos/tuinsituatie`, new Uint8Array(png), 201);
    expect(wijzigingen(await items(vanaf))).toEqual([{ tuinsituatie: [null, 'a'], 'fotos.tuinsituatie': [[], [foto.id]] }]);
  });

  it('is not interrupted by edits to another dossier', async () => {
    const ander = await nieuwDossier(bea);
    t.klok.verschuif(2 * 60 * MIN);
    const vanaf = laatsteId();
    await zet(bea, 'wensen', 'a');
    await bea.json('PATCH', `/api/dossiers/${ander}`, { key: 'wensen', value: 'elders' });
    await zet(bea, 'wensen', 'ab');
    expect(wijzigingen(await items(vanaf))).toEqual([{ wensen: [null, 'ab'] }]);
  });
});

describe('autosave values', () => {
  it('stores an empty text as no value at all', async () => {
    await zet(bea, 'wensen', 'iets');
    await zet(bea, 'wensen', '   ');
    expect('wensen' in (await data())).toBe(false);
  });

  it('refuses an unknown field, also one that only looks like a list item', async () => {
    expect((await zet(bea, 'bestaat_niet', 'x', 400)).fout).toBe('Onbekend veld: bestaat_niet');
    await zet(bea, 'regenpijp.abc.bestaat_niet', 'x', 400);
    await zet(bea, '__proto__', 'x', 400);
  });

  it('keeps numbers within their bounds', async () => {
    expect((await zet(kees, 'dak.ab12cd.m2', -1, 400)).fout).toBe('Dak m² moet tussen 0 en ∞ liggen.');
    await zet(kees, 'dak.ab12cd.m2', '50', 400);
    await zet(kees, 'dak.ab12cd.m2', 0);
    await zet(kees, 'dak.ab12cd.m2', 37.5);
    expect((await zet(kees, 'materiaal.ab12cd.prijs', -5, 400)).fout).toBe('Prijs moet tussen 0 en ∞ liggen.');
  });

  it('accepts only real calendar dates', async () => {
    await zet(kees, 'afspraak', '2026-02-29T10:00', 400);
    await zet(kees, 'afspraak', '2026-03-10', 400);
    await zet(kees, 'afspraak', '2026-03-10T10:00:00', 400);
    await zet(kees, 'afspraak', '2028-02-29T10:00');
    expect((await bea.json('GET', `/api/dossiers/${id}`)).dossier.afspraak).toBe('2028-02-29T10:00');
  });

  it('accepts only the listed options, each once', async () => {
    await zet(bea, 'huur_koop', 'gehuurd', 400);
    await zet(kees, 'regenpijp.ab12cd.hoe', ['ondergronds', 'ondergronds'], 400);
    await zet(kees, 'regenpijp.ab12cd.hoe', ['ondergronds', 'onbekend'], 400);
    await zet(kees, 'regenpijp.ab12cd.hoe', ['ondergronds', 'holie_molie']);
    await zet(kees, 'regenpijp.ab12cd.hoe', []);
    expect('regenpijp.ab12cd.hoe' in (await data())).toBe(false);
  });

  it('accepts a verdeling of whole percents 1-100 adding up to 100, or {} for no regenpijp', async () => {
    for (const fout of [[], 'r1', { r1: 60, r2: 30 }, { r1: 100, r2: 0 }, { r1: 50.5, r2: 49.5 }, { r1: 101 }, { R1: 100 }, { r1: '100' }]) await zet(kees, 'dak.d1.verdeling', fout, 400);
    await zet(kees, 'dak.d1.verdeling', { r1: 62, r2: 38 });
    await zet(kees, 'dak.d2.verdeling', {});
    expect(await data()).toMatchObject({ 'dak.d1.verdeling': { r1: 62, r2: 38 }, 'dak.d2.verdeling': {} });
  });

  it('stores the Anders write-in next to its field', async () => {
    await zet(bea, 'woningtype', 'anders');
    await zet(bea, 'woningtype_anders', 'Woonboot');
    expect(await data()).toMatchObject({ woningtype: 'anders', woningtype_anders: 'Woonboot' });
    await zet(bea, 'woningtype_anders', 12, 400);
  });

  it('refuses a body without a key, or that is not JSON', async () => {
    await bea.json('PATCH', `/api/dossiers/${id}`, { value: 'x' }, 400);
    const res = await bea.verzoek('PATCH', `/api/dossiers/${id}`, new TextEncoder().encode('{kapot'));
    expect(res.status).toBe(400);
  });
});

describe('milestones', () => {
  it('registers a double-tapped Klaar voor controle once, with one mail to the admins', async () => {
    t.mailer.verstuurd = [];
    const vanaf = laatsteId();
    const tik = () => kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await Promise.all([tik(), tik()]);
    expect((await items(vanaf)).map((i) => i.type)).toEqual(['mijlpaal', 'melding_verstuurd']);
    expect(t.mailer.verstuurd).toHaveLength(1);
  });
});

describe('riool autodetectie', () => {
  const dossier = async () => (await bea.json('GET', `/api/dossiers/${id}`)).dossier as { adres: { straat: string }; data: Record<string, unknown>; extra: { riool: unknown } };

  it('stores the guess next to the address without touching the rioolstelsel field', async () => {
    await zet(bea, 'rioolstelsel', 'gescheiden');
    await bea.json('POST', `/api/dossiers/${id}/adres`, { id: PDOK_ADRES.id });
    const d = await dossier();
    expect(d.extra.riool).toEqual({ soort: 'gevonden', stelsel: 'gemengd', uitleg: 'Gemengd riool op 6 m, geen huisaansluiting gevonden', at: t.ctx.klok.iso() });
    expect(d.data.rioolstelsel).toBe('gescheiden');
  });

  it('still saves the address when the rioolkaart fails, and stores the failure', async () => {
    const echt = t.ctx.haal;
    t.ctx.haal = async (invoer, init) => (String(invoer).includes('/Riool_leidingen_openbaar/') ? new Response('kapot', { status: 500 }) : echt(invoer, init));
    await bea.json('POST', `/api/dossiers/${id}/adres`, { id: PDOK_ADRES.id });
    const d = await dossier();
    expect(d.adres.straat).toBe('Walstraat');
    expect(d.extra.riool).toMatchObject({ soort: 'fout', bericht: 'De rioolkaart van de gemeente gaf een fout (500).' });
  });
});
