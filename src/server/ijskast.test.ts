// Dossier in ijskast doen: the routes, the default list, and the one mail to the eigenaar on the day.
import { beforeEach, describe, expect, it } from 'vitest';
import { ijskastWekker } from './ijskast.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

let t: TestApp;
let bea: Klant;
let kees: Klant;
let id: number;

// The test clock starts on 2 March 2026, 10:00 in Amsterdam.
beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  maakGebruiker(t, 'Kees Klus', 'klusser');
  bea = await new Klant(t).login('bea.beheer@example.org');
  kees = await new Klant(t).login('kees.klus@example.org');
  id = await nieuwDossier(bea);
  t.mailer.verstuurd = [];
});

const inIjskast = (tot = '2026-03-10', reden = 'Bewoner verbouwt eerst', status = 200) => bea.json('POST', `/api/dossiers/${id}/ijskast`, { tot, reden }, status);
const lijstIds = async (q = '') => (await bea.json<{ rijen: { id: number; status: string }[] }>('GET', `/api/dossiers${q}`)).rijen;
const mails = () => t.mailer.verstuurd.filter((m) => m.onderwerp.startsWith('Uit de ijskast'));

describe('Dossier in ijskast doen', () => {
  it('stores the reden and date, leaves the dossier out of the default list and shows it with the ijskast filter', async () => {
    const { dossier } = await inIjskast();
    expect(dossier.ijskast).toMatchObject({ tot: '2026-03-10', reden: 'Bewoner verbouwt eerst' });
    expect((await lijstIds()).map((r) => r.id)).not.toContain(id);
    expect(await lijstIds('?s_ijskast=ja')).toEqual([expect.objectContaining({ id, status: 'In de ijskast tot 10 maart 2026' })]);
  });

  it('refuses a date that is not in the future, an empty reden, a second time and a klusser', async () => {
    await inIjskast('2026-03-02', 'x', 400);
    await inIjskast('2026-03-10', ' ', 400);
    await kees.json('POST', `/api/dossiers/${id}/ijskast`, { tot: '2026-03-10', reden: 'x' }, 403);
    await inIjskast();
    await inIjskast('2026-03-20', 'nog eens', 409);
  });

  it('ends at once when taken out, without a mail', async () => {
    await inIjskast();
    const { dossier } = await bea.json('POST', `/api/dossiers/${id}/ijskast-uit`);
    expect(dossier.ijskast).toBeNull();
    expect((await lijstIds()).map((r) => r.id)).toContain(id);
    t.klok.zet(new Date('2026-03-10T09:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(0);
    expect(mails()).toEqual([]);
  });

  it('ends when the dossier is closed, without a mail', async () => {
    await inIjskast();
    await bea.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });
    t.klok.zet(new Date('2026-03-10T09:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(0);
    expect(mails()).toEqual([]);
  });
});

describe('the ijskast wekker', () => {
  it('mails the eigenaar once, from 08:00 on the day, with the reden and a link', async () => {
    await inIjskast();
    t.klok.zet(new Date('2026-03-10T06:59:00.000Z')); // 07:59 in Amsterdam
    expect(await ijskastWekker(t.ctx)).toBe(0);
    t.klok.zet(new Date('2026-03-10T07:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(1);
    expect(await ijskastWekker(t.ctx)).toBe(0);
    expect(mails()).toHaveLength(1);
    const [m] = mails();
    expect(m.aan).toBe('bea.beheer@example.org');
    expect(m.tekst).toContain('is vandaag uit de ijskast gekomen. Wat wil je ermee doen?');
    expect(m.tekst).toContain(`/dossiers/${id}`);
    expect(m.tekst).toContain('In de ijskast gedaan op 2 maart 2026 door Bea Beheer, met als reden:\nBewoner verbouwt eerst');
    const { items } = await bea.json<{ items: { type: string }[] }>('GET', `/api/dossiers/${id}/activiteit`);
    expect(items.map((i) => i.type).slice(0, 3)).toEqual(['melding_verstuurd', 'ijskast_voorbij', 'ijskast_in']);
  });

  it('still mails a day it missed, and the dossier is back in the default list from midnight', async () => {
    await inIjskast();
    t.klok.zet(new Date('2026-03-09T23:00:00.000Z')); // 00:00 on the day
    expect((await lijstIds()).map((r) => r.id)).toContain(id);
    t.klok.zet(new Date('2026-03-12T09:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(1);
  });

  it('lets an admin put it back in after the day came but before the mail, which then goes for the new date only', async () => {
    await inIjskast();
    t.klok.zet(new Date('2026-03-10T06:00:00.000Z'));
    await inIjskast('2026-03-20', 'Nog een week');
    t.klok.zet(new Date('2026-03-10T09:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(0);
    t.klok.zet(new Date('2026-03-20T09:00:00.000Z'));
    expect(await ijskastWekker(t.ctx)).toBe(1);
    expect(mails()[0].tekst).toContain('Nog een week');
  });
});
