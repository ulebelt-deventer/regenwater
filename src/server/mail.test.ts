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
    expect(v.waarden).toEqual({ bewoner: 'Anna de Vries', adres: 'Walstraat 74, Deventer', corporatie: 'Ieder1', afzender: 'Bea Beheer', subsidie_info: 'https://www.deventer.nl/subsidieloket/duurzaamheidssubsidies/subsidie-voor-groene-en-watervriendelijke-maatregelen' });
    expect(v).toMatchObject({ aan: 'anna@example.org', cc: 'bea.beheer@example.org', extraCc: '', bijlage: null });
  });

  it("leaves the subsidie link empty for a gemeente without a known subsidiepagina, and flags the sent mail", async () => {
    t.ctx.db.prepare("UPDATE dossiers SET adres_json = json_set(adres_json, '$.gemeente', 'Zwolle') WHERE id = ?").run(id);
    const v = await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_koop`);
    expect(v.waarden.subsidie_info).toBe('');
    await stuur('subsidie_koop', { tekst: v.tekst });
    expect((await laatsteAudit()).payload.tag_problemen).toBe(true);
  });

  it('sends the subject and text exactly as edited', async () => {
    await stuur('plan_bewoner_huur', { onderwerp: 'Over de Walstraat', tekst: 'Beste Anna, {adres} blijft {adres}.' });
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

describe('Reply-To', () => {
  it("is the dossier's eigenaar, also when another admin sends the mail, who still gets the CC, and the pop-up says so", async () => {
    const annaId = maakGebruiker(t, 'Anna Admin', 'beheerder');
    expect((await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`)).replyTo).toEqual({ naam: 'Bea Beheer', email: 'bea.beheer@example.org' });
    await bea.json('POST', `/api/dossiers/${id}/eigenaar`, { gebruiker_id: annaId });
    expect((await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`)).replyTo).toEqual({ naam: 'Anna Admin', email: 'anna.admin@example.org' });
    await stuur('subsidie_huur', {});
    expect(t.mailer.verstuurd[0]).toMatchObject({ replyTo: 'anna.admin@example.org', cc: 'bea.beheer@example.org' });
  });
});

describe('woningcorporatie addresses', () => {
  const zet = (corporatie: string, aan: unknown, cc: unknown, status = 200) => bea.json('PUT', `/api/corporaties/${encodeURIComponent(corporatie)}`, { aan, cc }, status);
  const corporatieMail = async () => bea.json('GET', `/api/dossiers/${id}/mail/plan_corporatie`);

  it('lists every woningcorporatie, empty until an admin enters addresses', async () => {
    const { corporaties } = await bea.json('GET', '/api/corporaties');
    expect(corporaties).toEqual(['SallandWonen', 'Rentree', 'Ieder1', 'De Marken'].map((corporatie) => ({ corporatie, aan: '', cc: '' })));
    expect(await corporatieMail()).toMatchObject({ aan: '', extraCc: '' });
  });

  it("prefills Aan and the extra CC of the dossier's woningcorporatie, trimmed, and only on its mails", async () => {
    await zet('Ieder1', ' woningen@example.org ', 'wijk@example.org');
    await zet('Rentree', 'rentree@example.org', '');
    expect(await corporatieMail()).toMatchObject({ aan: 'woningen@example.org', extraCc: 'wijk@example.org' });
    expect(await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`)).toMatchObject({ aan: 'anna@example.org', extraCc: '' });
    await bea.json('PATCH', `/api/dossiers/${id}`, { key: 'woningeigenaar', value: 'anders' });
    expect(await corporatieMail()).toMatchObject({ aan: '', extraCc: '' });
  });

  it('refuses an invalid address or an unknown woningcorporatie, and records each change', async () => {
    expect((await zet('Ieder1', 'woningen@example', '', 400)).fout).toBe('Vul een geldig e-mailadres in bij Aan, of laat het leeg.');
    expect((await zet('Ieder1', '', 'a@b.nl, c@d.nl', 400)).fout).toBe('Vul een geldig e-mailadres in bij CC, of laat het leeg.');
    await zet('Ieder1', undefined, '', 400);
    await zet('Onbekend', '', '', 404);
    await zet('Ieder1', 'woningen@example.org', '');
    await zet('Ieder1', 'woningen@example.org', '');
    await zet('Ieder1', '', 'wijk@example.org');
    const { items } = await bea.json('GET', '/api/activiteit');
    const eigen = items.filter((i: { type: string }) => i.type === 'corporatie_adres_gewijzigd').map((i: { payload: unknown }) => i.payload);
    expect(eigen).toEqual([
      { corporatie: 'Ieder1', oud: { aan: 'woningen@example.org', cc: '' }, nieuw: { aan: '', cc: 'wijk@example.org' } },
      { corporatie: 'Ieder1', oud: { aan: '', cc: '' }, nieuw: { aan: 'woningen@example.org', cc: '' } },
    ]);
  });

  it('is for admins only', async () => {
    const kees = await new Klant(t).login('kees.klus@example.org');
    await kees.json('GET', '/api/corporaties', undefined, 403);
    await kees.json('PUT', '/api/corporaties/Ieder1', { aan: '', cc: '' }, 403);
  });
});

describe('subsidiepaginas', () => {
  interface Rij { id: number; gemeente: string; url: string }
  const lijst = async () => (await bea.json<{ subsidiepaginas: Rij[] }>('GET', '/api/subsidiepaginas')).subsidiepaginas;
  const rijVan = async (gemeente: string) => (await lijst()).find((r) => r.gemeente === gemeente)!;
  const link = async () => (await bea.json('GET', `/api/dossiers/${id}/mail/subsidie_huur`)).waarden.subsidie_info;
  const plan = async () => (await bea.verzoek('GET', `/docs/dossiers/${id}/concept-plan`)).text();
  const naarZwolle = () => t.ctx.db.prepare("UPDATE dossiers SET adres_json = json_set(adres_json, '$.gemeente', 'Zwolle') WHERE id = ?").run(id);

  it('starts with Deventer, Olst-Wijhe and Raalte', async () => {
    expect((await lijst()).map((r) => r.gemeente)).toEqual(['Deventer', 'Olst-Wijhe', 'Raalte']);
  });

  it("suggests the gemeenten of the dossiers' adressen", async () => {
    naarZwolle();
    expect((await bea.json('GET', '/api/subsidiepaginas')).gemeenten).toContain('Zwolle');
  });

  it('feeds a changed, added or deleted link to the mail and the Plan', async () => {
    const deventer = await rijVan('Deventer');
    await bea.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: ' https://subsidie.example.org/deventer ' });
    expect(await link()).toBe('https://subsidie.example.org/deventer');
    expect(await plan()).toContain('href="https://subsidie.example.org/deventer"');

    naarZwolle();
    expect(await link()).toBe('');
    await bea.json('POST', '/api/subsidiepaginas', { gemeente: 'zwolle', url: 'https://subsidie.example.org/zwolle' });
    expect(await link()).toBe('https://subsidie.example.org/zwolle');
    expect(await plan()).toContain('href="https://subsidie.example.org/zwolle"');

    await bea.json('DELETE', `/api/subsidiepaginas/${(await rijVan('zwolle')).id}`);
    expect(await link()).toBe('');
    expect(await plan()).toMatch(/qa-pdf-subsidie.*nog niet ingevuld/);
  });

  it('refuses a missing gemeente, a duplicate in any case, a link that is not http(s) and an unknown row, and records each change', async () => {
    const deventer = await rijVan('Deventer');
    expect((await bea.json('POST', '/api/subsidiepaginas', { gemeente: ' ', url: 'https://example.org' }, 400)).fout).toBe('Vul een gemeente in.');
    expect((await bea.json('POST', '/api/subsidiepaginas', { gemeente: 'deventer', url: 'https://example.org' }, 409)).fout).toBe('deventer staat al in de tabel.');
    expect((await bea.json('POST', '/api/subsidiepaginas', { gemeente: 'Zwolle', url: 'www.zwolle.nl' }, 400)).fout).toBe('Vul een volledige link in, die begint met https://.');
    await bea.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: 'javascript:alert(1)' }, 400);
    await bea.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: 12 }, 400);
    await bea.json('PATCH', '/api/subsidiepaginas/999', { url: 'https://example.org' }, 404);
    await bea.json('DELETE', '/api/subsidiepaginas/999', undefined, 404);
    expect((await rijVan('Deventer')).url).toBe(deventer.url);

    await bea.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: deventer.url });
    await bea.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: 'https://subsidie.example.org/deventer' });
    await bea.json('POST', '/api/subsidiepaginas', { gemeente: 'Zwolle', url: 'https://subsidie.example.org/zwolle' });
    await bea.json('DELETE', `/api/subsidiepaginas/${(await rijVan('Zwolle')).id}`);
    const { items } = await bea.json('GET', '/api/activiteit');
    const eigen = items.filter((i: { type: string }) => i.type.startsWith('subsidiepagina_')).map((i: { type: string; payload: unknown }) => [i.type, i.payload]);
    expect(eigen).toEqual([
      ['subsidiepagina_verwijderd', { gemeente: 'Zwolle', url: 'https://subsidie.example.org/zwolle' }],
      ['subsidiepagina_toegevoegd', { gemeente: 'Zwolle', url: 'https://subsidie.example.org/zwolle' }],
      ['subsidiepagina_gewijzigd', { gemeente: 'Deventer', oud: deventer.url, nieuw: 'https://subsidie.example.org/deventer' }],
    ]);
  });

  it('is for admins only', async () => {
    const kees = await new Klant(t).login('kees.klus@example.org');
    const deventer = await rijVan('Deventer');
    await kees.json('GET', '/api/subsidiepaginas', undefined, 403);
    await kees.json('POST', '/api/subsidiepaginas', { gemeente: 'Zwolle', url: 'https://example.org' }, 403);
    await kees.json('PATCH', `/api/subsidiepaginas/${deventer.id}`, { url: 'https://example.org' }, 403);
    await kees.json('DELETE', `/api/subsidiepaginas/${deventer.id}`, undefined, 403);
  });
});

describe('extra CC', () => {
  it('copies an extra address on both woningcorporatie mails, beside the sender, and records it', async () => {
    const { dossier } = await stuur('plan_corporatie', { aan: 'ieder1@example.org', cc: ' wijk@example.org ' });
    expect(t.mailer.verstuurd[0].cc).toBe('bea.beheer@example.org, wijk@example.org');
    expect(dossier.verzendingen[0].cc).toBe('bea.beheer@example.org, wijk@example.org');
    expect((await laatsteAudit()).payload).toMatchObject({ aan: 'ieder1@example.org', cc: 'wijk@example.org' });
    await bea.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
    await stuur('oplever_corporatie', { aan: 'ieder1@example.org', cc: 'wijk@example.org' });
    expect(t.mailer.verstuurd[1].cc).toBe('bea.beheer@example.org, wijk@example.org');
  });

  it('copies only the sender when the CC is left empty', async () => {
    await stuur('plan_corporatie', { aan: 'ieder1@example.org', cc: '  ' });
    expect(t.mailer.verstuurd[0].cc).toBe('bea.beheer@example.org');
    expect((await laatsteAudit()).payload).not.toHaveProperty('cc');
  });

  it('refuses an invalid CC, and any CC on a mail that is not to the woningcorporatie', async () => {
    expect((await stuur('plan_corporatie', { cc: 'wijk@example' }, 400)).fout).toBe('Vul een geldig e-mailadres in bij CC.');
    await stuur('plan_corporatie', { cc: 'a@b.nl, c@d.nl' }, 400);
    expect((await stuur('plan_bewoner_huur', { cc: 'wijk@example.org' }, 400)).fout).toBe('Deze e-mail heeft geen CC.');
    expect(t.mailer.verstuurd).toEqual([]);
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
