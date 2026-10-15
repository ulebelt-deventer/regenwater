// Sending a template mail from the popup: validation, the prefilled text, closed dossiers and manual sends.
import { beforeEach, describe, expect, it } from 'vitest';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

let t: TestApp;
let bea: Klant;
let keesId: number;
let id: number;

beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  keesId = maakGebruiker(t, 'Kees Klus', 'klusser');
  bea = await new Klant(t).login('bea.beheer@example.org');
  id = await nieuwDossier(bea);
  t.mailer.verstuurd = [];
});

const stuur = (sjabloon: string, inhoud: Record<string, unknown>, status = 200) => bea.json('POST', `/api/dossiers/${id}/mail/${sjabloon}`, { aan: 'anna@example.org', onderwerp: 'Onderwerp', tekst: 'Tekst', ...inhoud }, status);
const laatsteAudit = async () => (await bea.json<{ items: { type: string; payload: Record<string, unknown> }[] }>('GET', `/api/dossiers/${id}/activiteit`)).items[0];

describe('validation', () => {
  it('refuses an invalid or empty Aan, and trims spaces around a valid one', async () => {
    expect((await stuur('subsidie_huur', { aan: 'anna@example' }, 400)).fout).toBe('Vul een geldig e-mailadres in bij Aan.');
    await stuur('subsidie_huur', { aan: '' }, 400);
    await stuur('subsidie_huur', { aan: 'anna @example.org' }, 400);
    await stuur('subsidie_huur', { aan: 'a@b.nl, c@d.nl' }, 400);
    await stuur('subsidie_huur', { aan: '  anna@example.org ' });
    expect(t.mailer.verstuurd[0].aan).toBe('anna@example.org');
  });

  it('refuses an empty subject or a body of only spaces', async () => {
    expect((await stuur('subsidie_huur', { onderwerp: '  ' }, 400)).fout).toBe('Onderwerp en tekst mogen niet leeg zijn.');
    await stuur('subsidie_huur', { tekst: ' \n ' }, 400);
    await stuur('subsidie_huur', { tekst: 12 }, 400);
    expect(t.mailer.verstuurd).toEqual([]);
  });

  it('answers 404 for an unknown template and for the Signal oproep, which is not a mail', async () => {
    await bea.json('GET', `/api/dossiers/${id}/mail/bestaat_niet`, undefined, 404);
    await stuur('oproep_signal', {}, 404);
  });

  it('keeps the mail popup for admins only', async () => {
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
    const kees = await new Klant(t).login('kees.klus@example.org');
    await kees.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`, undefined, 403);
    await kees.json('POST', `/api/dossiers/${id}/mail/subsidie_huur`, { aan: 'a@b.nl', onderwerp: 'x', tekst: 'y' }, 403);
  });
});

describe('tags', () => {
  it('prefills subject and text with the tags filled in for this dossier, and offers the value of each tag', async () => {
    const v = await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`);
    expect(v.tekst).toContain('Beste Anna de Vries,');
    expect(v.tekst).toContain('regenwater op Walstraat 74, Deventer.');
    expect(`${v.onderwerp} ${v.tekst}`).not.toMatch(/\{[a-z_]+\}/);
    expect(v.waarden).toEqual({ bewoner: 'Anna de Vries', adres: 'Walstraat 74, Deventer', corporatie: 'Ieder1', afzender: 'Bea Beheer', subsidie_info: expect.stringMatching(/^https:\/\//) as string });
    expect(v).toMatchObject({ aan: 'anna@example.org', cc: 'bea.beheer@example.org', bijlage: null });
  });

  it('sends the subject and text exactly as edited', async () => {
    await stuur('subsidie_huur', { onderwerp: 'Over de Walstraat', tekst: 'Beste Anna, {adres} blijft {adres}.' });
    expect(t.mailer.verstuurd[0]).toMatchObject({ onderwerp: 'Over de Walstraat', tekst: 'Beste Anna, {adres} blijft {adres}.' });
    expect((await laatsteAudit()).payload).toMatchObject({ tag_problemen: false, onderwerp: 'Over de Walstraat' });
  });

  it('flags a deleted dossier link in a klusser mail but sends anyway, and not when the link is there', async () => {
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
    const { waarden } = await bea.json<{ waarden: Record<string, string> }>('GET', `/api/dossiers/${id}/mail/bezoeker_toegewezen`);
    t.mailer.verstuurd = [];
    await stuur('bezoeker_toegewezen', { aan: 'kees.klus@example.org', tekst: 'Hoi Kees' });
    expect(t.mailer.verstuurd[0].tekst).toBe('Hoi Kees');
    expect((await laatsteAudit()).payload.tag_problemen).toBe(true);
    await stuur('bezoeker_toegewezen', { aan: 'kees.klus@example.org', tekst: `Hoi Kees, zie ${waarden.link}` });
    expect((await laatsteAudit()).payload.tag_problemen).toBe(false);
  });

  it("puts the klusser's address in the dossier link's href only, and leaves other mails' links alone", async () => {
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
    const { waarden } = await bea.json<{ waarden: Record<string, string> }>('GET', `/api/dossiers/${id}/mail/bezoeker_toegewezen`);
    t.mailer.verstuurd = [];
    await stuur('bezoeker_toegewezen', { aan: 'kees.klus@example.org', tekst: `Zie ${waarden.link}` });
    expect(t.mailer.verstuurd[0].tekst).toBe(`Zie ${waarden.link}`);
    expect(t.mailer.verstuurd[0].html).toContain(`<a href="${waarden.link}?email=kees.klus%40example.org">${waarden.link}</a>`);
    await stuur('subsidie_huur', { tekst: `Zie ${waarden.link}` });
    expect(t.mailer.verstuurd[1].html).toBeUndefined();
  });
});

describe('closed dossiers and the opleverrapport', () => {
  it('refuses ordinary mails on a closed dossier', async () => {
    await bea.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });
    expect((await stuur('subsidie_huur', {}, 409)).fout).toBe('Dit dossier is gesloten. Heropen het om deze e-mail te versturen.');
  });

  it('refuses the opleverrapport before Werk opgeleverd, and allows it after closing', async () => {
    expect((await stuur('oplever_bewoner', {}, 409)).fout).toBe('Het werk is nog niet opgeleverd.');
    await bea.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    await bea.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Uitgevoerd', toelichting: '' });
    await stuur('oplever_bewoner', {});
    expect(t.mailer.verstuurd[0].bijlagen!.map((b) => b.naam)).toEqual([expect.stringMatching(/^Opleverrapport/) as string]);
  });
});

describe('manual sends', () => {
  it('records a mail sent by hand without sending it or making a PDF', async () => {
    const { dossier } = await stuur('plan_corporatie', { aan: 'ieder1@example.org', handmatig: true });
    expect(t.mailer.verstuurd).toEqual([]);
    expect(t.pdfs).toEqual([]);
    expect(dossier.verzendingen[0]).toMatchObject({ sjabloon: 'plan_corporatie', aan: 'ieder1@example.org', cc: null, handmatig: true, mislukt_at: null });
    expect((await laatsteAudit()).type).toBe('handmatig_verstuurd');
  });

  it('treats only handmatig: true as manual', async () => {
    await stuur('subsidie_huur', { handmatig: 'true' });
    expect(t.mailer.verstuurd).toHaveLength(1);
  });
});
