// The bell in the navbar: in-app meldingen for a dossier's eigenaar.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Notificaties } from '../shared/types.ts';
import { ijskastWekker } from './ijskast.ts';
import { dossierMelding } from './meldingen.ts';
import { laadDossier } from './repo.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

let t: TestApp;
let bea: Klant;
let bart: Klant;
let bartId: number;
let kees: Klant;
let keesId: number;

beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  bartId = maakGebruiker(t, 'Bart Beheer', 'beheerder');
  keesId = maakGebruiker(t, 'Kees Klus', 'klusser');
  bea = await new Klant(t).login('bea.beheer@example.org');
  bart = await new Klant(t).login('bart.beheer@example.org');
  kees = await new Klant(t).login('kees.klus@example.org');
});

const lijst = (k: Klant) => k.json<Notificaties>('GET', '/api/notificaties');
const gelezen = (k: Klant, dossier_id: number) => k.json<Notificaties>('POST', '/api/notificaties/gelezen', { dossier_id });

// A klusser hands off a dossier owned by Bea; each call is a minute later than the one before.
async function klaarVoorControle(id: number): Promise<void> {
  await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
  await kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
  t.klok.verschuif(6e4);
}

describe('the bell', () => {
  it("lists unread meldingen above read ones, newest first, and opening one marks that dossier's meldingen read", async () => {
    const [a, b] = [await nieuwDossier(bea), await nieuwDossier(bea)];
    await klaarVoorControle(a);
    await klaarVoorControle(b);
    expect((await lijst(bea)).items.map((n) => n.dossier_id)).toEqual([b, a]);
    const na = await gelezen(bea, b);
    expect(na.ongelezen).toBe(1);
    expect(na.items.map((n) => [n.dossier_id, n.gelezen])).toEqual([[a, false], [b, true]]);
    expect(await lijst(bea)).toEqual(na);
  });

  it('counts only the unread ones and marks every melding of the opened dossier', async () => {
    const id = await nieuwDossier(bea);
    await klaarVoorControle(id);
    t.mailer.faalVoor = 'anna@example.org';
    await bea.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: 'anna@example.org', onderwerp: 'Subsidie', tekst: 'Hallo' }, 502);
    expect((await lijst(bea)).ongelezen).toBe(2);
    expect((await gelezen(bea, id)).ongelezen).toBe(0);
  });

  it("goes to the dossier's eigenaar only, and read state is that beheerder's own", async () => {
    const id = await nieuwDossier(bea);
    await bea.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: bartId });
    await klaarVoorControle(id);
    expect((await lijst(bea)).items).toEqual([]);
    expect((await lijst(bart)).ongelezen).toBe(1);
    await gelezen(bea, id);
    expect((await lijst(bart)).ongelezen).toBe(1);
  });

  it("shows the dossier's current address", async () => {
    const id = await nieuwDossier(bea);
    await klaarVoorControle(id);
    expect((await lijst(bea)).items[0].adres).toBe('Walstraat 74, Deventer');
    t.ctx.db.prepare("UPDATE dossiers SET adres_json = json_set(adres_json, '$.huisnummer', 76) WHERE id = ?").run(id);
    expect((await lijst(bea)).items[0].adres).toBe('Walstraat 76, Deventer');
  });

  it('is for beheerders only, also during Inloggen als', async () => {
    await kees.json('GET', '/api/notificaties', undefined, 403);
    await kees.json('POST', '/api/notificaties/gelezen', { dossier_id: 1 }, 403);
    await bea.json('POST', `/api/auth/als/${keesId}`);
    await bea.json('GET', '/api/notificaties', undefined, 403);
  });

  it('disappears with its dossier', async () => {
    const id = await nieuwDossier(bea);
    await klaarVoorControle(id);
    await bea.json('DELETE', `/api/dossiers/${id}`);
    expect(await lijst(bea)).toEqual({ ongelezen: 0, items: [] });
  });

  it('comes back unread, on top, when a new melding arrives about a dossier already read', async () => {
    const [a, b] = [await nieuwDossier(bea), await nieuwDossier(bea)];
    await klaarVoorControle(a);
    await klaarVoorControle(b);
    await gelezen(bea, a);
    t.mailer.faalVoor = 'anna@example.org';
    await bea.json('POST', `/api/dossiers/${a}/mail/subsidie_huur`, { aan: 'anna@example.org', onderwerp: 'Subsidie', tekst: 'Hallo' }, 502);
    const { ongelezen, items } = await lijst(bea);
    expect(ongelezen).toBe(2);
    expect(items.map((n) => [n.dossier_id, n.titel.split(':')[0], n.gelezen])).toEqual([
      [a, 'E-mail niet afgeleverd', false],
      [b, 'Plan van Aanpak klaar voor controle (Kees Klus)', false],
      [a, 'Plan van Aanpak klaar voor controle (Kees Klus)', true],
    ]);
  });

  it('lists at most 50, unread before newer read ones, while the count covers every unread melding', async () => {
    const [oud, druk] = [await nieuwDossier(bea), await nieuwDossier(bea)];
    const meld = (id: number) => {
      dossierMelding(t.ctx, laadDossier(t.ctx.db, id)!, 'Test', null);
      t.klok.verschuif(1000);
    };
    meld(oud);
    for (let i = 0; i < 51; i++) meld(druk);
    const vol = await lijst(bea);
    expect(vol.ongelezen).toBe(52);
    expect(vol.items).toHaveLength(50);
    expect(vol.items.every((n) => n.dossier_id === druk)).toBe(true);
    const na = await gelezen(bea, druk);
    expect(na.ongelezen).toBe(1);
    expect(na.items).toHaveLength(50);
    expect(na.items[0]).toMatchObject({ dossier_id: oud, gelezen: false });
  });

  it('names a dossier without an address by its number', async () => {
    const { id } = await bea.json<{ id: number }>('POST', '/api/dossiers');
    dossierMelding(t.ctx, laadDossier(t.ctx.db, id)!, 'Test', null);
    expect((await lijst(bea)).items[0].adres).toBe(`Dossier ${id} (nog geen adres)`);
  });

  it('refuses a gelezen without a dossier number, and marking a dossier without meldingen changes nothing', async () => {
    const id = await nieuwDossier(bea);
    await klaarVoorControle(id);
    await bea.json('POST', '/api/notificaties/gelezen', { dossier_id: String(id) }, 400);
    await bea.json('POST', '/api/notificaties/gelezen', {}, 400);
    expect((await gelezen(bea, id + 1)).ongelezen).toBe(1);
  });
});

describe('what gives a melding', () => {
  const titels = async (k: Klant) => (await lijst(k)).items.map((n) => n.titel);

  it("gives the eigenaar Werk opgeleverd when the uitvoerder taps it, but not when an admin does", async () => {
    const [a, b] = [await nieuwDossier(bea), await nieuwDossier(bea)];
    await bea.json('POST', `/api/dossiers/${a}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: keesId });
    const mails = t.mailer.verstuurd.length;
    await kees.json('POST', `/api/dossiers/${a}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    await bea.json('POST', `/api/dossiers/${b}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    expect((await lijst(bea)).items).toEqual([expect.objectContaining({ dossier_id: a, titel: 'Werk opgeleverd (Kees Klus)', detail: null, gelezen: false })]);
    expect(t.mailer.verstuurd).toHaveLength(mails);
  });

  it("gives none for the bezoeker's Bezoek afronden: the ball stays with the bezoeker", async () => {
    const id = await nieuwDossier(bea);
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
    await kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond' });
    expect(await lijst(bea)).toEqual({ ongelezen: 0, items: [] });
  });

  it('goes to the eigenaar when another admin taps Klaar voor controle while "Inloggen als" the klusser', async () => {
    const id = await nieuwDossier(bea);
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
    await bart.json('POST', `/api/auth/als/${keesId}`);
    await bart.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await bart.json('POST', '/api/auth/als/stop');
    expect(await titels(bea)).toEqual(['Plan van Aanpak klaar voor controle (Kees Klus)']);
    expect(await titels(bart)).toEqual([]);
  });

  it('gives the eigenaar, not the admin who put it there, Uit de ijskast, naming who did', async () => {
    const id = await nieuwDossier(bea);
    await bart.json('POST', `/api/dossiers/${id}/ijskast`, { tot: '2026-03-10', reden: 'Bewoner verbouwt eerst' });
    t.klok.zet(new Date('2026-03-10T07:00:00.000Z'));
    expect(ijskastWekker(t.ctx)).toBe(1);
    bea = await new Klant(t).login('bea.beheer@example.org');
    bart = await new Klant(t).login('bart.beheer@example.org');
    expect((await lijst(bea)).items).toEqual([
      expect.objectContaining({ dossier_id: id, titel: 'Uit de ijskast', detail: 'In de ijskast gedaan op 2 maart 2026 door Bart Beheer, met als reden: Bewoner verbouwt eerst', created_at: '2026-03-10T07:00:00.000Z' }),
    ]);
    expect(await titels(bart)).toEqual([]);
  });
});
