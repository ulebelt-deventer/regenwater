// The CSV export: every column, the Dutch Excel dialect, and who may download it.
import { beforeEach, describe, expect, it } from 'vitest';
import { aandacht } from '../shared/aandacht.ts';
import { ADRES, dossier, gebruiker, naInschrijving, verzending } from '../shared/testhulp.ts';
import { csv, csvExport, filter, leesFilters, lijstRij } from './lijst.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

const NU = new Date('2026-04-01T10:00:00.000Z');
const BEHEERDER = gebruiker(1, { rol: 'beheerder', naam: 'Bea' });
const GM = new Map([[1, BEHEERDER], [7, gebruiker(7, { naam: 'Kees' })], [8, gebruiker(8, { naam: 'Ria' })]]);

// Parses our own output back: semicolons, quoted cells with doubled quotes, CRLF rows.
function lees(tekst: string): string[][] {
  expect(tekst.startsWith('﻿')).toBe(true);
  const rijen: string[][] = [[]];
  let cel = '';
  let quote = false;
  for (let i = 1; i < tekst.length; i++) {
    const c = tekst[i];
    if (quote) {
      if (c === '"' && tekst[i + 1] === '"') {
        cel += '"';
        i++;
      } else if (c === '"') quote = false;
      else cel += c;
    } else if (c === '"') quote = true;
    else if (c === ';') {
      rijen.at(-1)!.push(cel);
      cel = '';
    } else if (c === '\r' && tekst[i + 1] === '\n') {
      rijen.at(-1)!.push(cel);
      cel = '';
      rijen.push([]);
      i++;
    } else cel += c;
  }
  expect(rijen.pop()).toEqual([]);
  return rijen;
}

// The export of one dossier as {column: cell}.
function exporteer(d: ReturnType<typeof dossier>): Record<string, string> {
  const [kop, rij] = lees(csvExport([d], new Map([[d.id, lijstRij(d, GM, NU, BEHEERDER)]])));
  expect(rij).toHaveLength(kop.length);
  return Object.fromEntries(kop.map((k, i) => [k, rij[i]]));
}

describe('csv()', () => {
  it('starts with a BOM, separates with semicolons and ends rows with CRLF', () => {
    expect(csv([['a', 'b'], ['c', 'd']])).toBe('﻿a;b\r\nc;d\r\n');
  });

  it('quotes cells with a semicolon, quote or line break, doubling the quotes', () => {
    expect(csv([['a;b', 'zei "ja"', 'regel 1\nregel 2', 'cr\rhier', 'gewoon']])).toBe('﻿"a;b";"zei ""ja""";"regel 1\nregel 2";"cr\rhier";gewoon\r\n');
  });

  it('writes numbers with a decimal comma and null as an empty cell', () => {
    expect(csv([[12.5, 0, -3.25, 1000, null]])).toBe('﻿12,5;0;-3,25;1000;\r\n');
  });

  it('round-trips awkward text through a parser', () => {
    const lastig = ['Café "De Ulebelt"; achterom', 'twee\r\nregels', '=SOM(A1)', ''];
    expect(lees(csv([lastig]))).toEqual([lastig]);
  });
});

describe('csvExport()', () => {
  it('has every column in order', () => {
    expect(Object.keys(exporteer(dossier()))).toEqual([
      'Dossier-ID', 'Aangemaakt op', 'Straat', 'Huisnummer', 'Postcode', 'Plaats', 'Gemeente', 'Huur/koop', 'Woningeigenaar', 'Woningtype', 'Rioolstelsel',
      'Bewoner naam', 'Bewoner e-mail', 'Bewoner telefoon', 'Bezoeker', 'Uitvoerder', 'Status', 'Aandacht nodig',
      'Subsidiemail', 'Bezoeker toegewezen', 'Afspraak', 'Bezoek afgerond', 'Klaar voor controle', 'Plan verstuurd naar bewoner',
      'Plan verstuurd naar woningcorporatie', 'Akkoord', 'Uitvoerder toegewezen', 'Uitvoering gepland', 'Werk opgeleverd', 'Opleverrapport verstuurd', 'Gesloten',
      'Reden gesloten', 'Dak m² (totaal)', 'Aantal regenpijpen', 'Regentonnen gewenst', 'Geschatte materiaalkosten', 'Gebruikte materiaalkosten',
    ]);
  });

  it('leaves the cells of a brand-new dossier empty, with zero counts and amounts', () => {
    const r = exporteer(dossier({ id: 5 }));
    expect(r).toMatchObject({ 'Dossier-ID': '5', 'Aangemaakt op': '2026-03-01', Straat: '', Huisnummer: '', 'Huur/koop': '', Woningeigenaar: '', Bezoeker: '' });
    expect(r).toMatchObject({ 'Dak m² (totaal)': '', 'Aantal regenpijpen': '0', 'Regentonnen gewenst': '0', 'Geschatte materiaalkosten': '0', 'Gebruikte materiaalkosten': '0' });
  });

  it('writes Aandacht nodig as ja or nee, following the attention rules', () => {
    const nieuw = dossier();
    const klaar = naInschrijving('koop', { gesloten_at: '2026-03-20T09:00:00.000Z', gesloten_reden: 'Uitgevoerd' });
    expect([aandacht(nieuw, GM, NU).nodig, aandacht(klaar, GM, NU).nodig]).toEqual([true, false]);
    expect([exporteer(nieuw)['Aandacht nodig'], exporteer(klaar)['Aandacht nodig']]).toEqual(['ja', 'nee']);
  });

  it('writes the address parts, with huisletter and toevoeging in the huisnummer', () => {
    const r = exporteer(dossier({ adres: { ...ADRES, huisnummer: 12, huisletter: 'a', toevoeging: '2' } }));
    expect(r).toMatchObject({ Straat: 'Walstraat', Huisnummer: '12a-2', Postcode: '7411GK', Plaats: 'Deventer', Gemeente: 'Deventer' });
  });

  it('writes option labels, the Anders write-in, and the corporatie only for huur', () => {
    const huur = naInschrijving('huur', { data: { ...naInschrijving('huur').data, woningeigenaar: 'anders', woningeigenaar_anders: 'Particulier', woningtype: 'anders', woningtype_anders: 'Woonboot', rioolstelsel: 'gescheiden' } });
    expect(exporteer(huur)).toMatchObject({ 'Huur/koop': 'huur', Woningeigenaar: 'Particulier', Woningtype: 'Woonboot', Rioolstelsel: 'Gescheiden' });
    const koop = naInschrijving('koop', { data: { ...naInschrijving('koop').data, woningeigenaar: 'Ieder1', woningtype: '2-onder-1-kap' } });
    expect(exporteer(koop)).toMatchObject({ Woningeigenaar: '', Woningtype: '2-onder-1-kap' });
  });

  it('writes the bewoner and the assigned klussers by name', () => {
    const d = naInschrijving('huur', { bezoeker_id: 7, uitvoerder_id: 8, data: { ...naInschrijving('huur').data, bewoner_telefoon: '06 12345678' } });
    expect(exporteer(d)).toMatchObject({ 'Bewoner naam': 'Anna de Vries', 'Bewoner e-mail': 'anna@example.org', 'Bewoner telefoon': '06 12345678', Bezoeker: 'Kees', Uitvoerder: 'Ria' });
  });

  it('writes dates as YYYY-MM-DD in Dutch time, also just after midnight', () => {
    const d = naInschrijving('huur', {
      created_at: '2026-03-01T23:30:00.000Z', // 00:30 on 2 March in Amsterdam
      bezoeker_toegewezen_at: '2026-03-03T09:00:00.000Z',
      afspraak: '2026-03-10T00:15',
      bezoek_afgerond_at: '2026-03-10T11:00:00.000Z',
      klaar_voor_controle_at: '2026-06-30T22:30:00.000Z', // summer time: 1 July
      uitvoering_gepland: '2026-07-15',
    });
    expect(exporteer(d)).toMatchObject({
      'Aangemaakt op': '2026-03-02', 'Bezoeker toegewezen': '2026-03-03', Afspraak: '2026-03-10', 'Bezoek afgerond': '2026-03-10', 'Klaar voor controle': '2026-07-01', 'Uitvoering gepland': '2026-07-15',
    });
  });

  it('dates each mail column by the first successful send of its templates', () => {
    const d = naInschrijving('huur', {
      verzendingen: [
        verzending('subsidie_huur', '2026-03-02T09:00:00.000Z', { mislukt_at: '2026-03-02T09:00:00.000Z' }),
        verzending('subsidie_huur', '2026-03-03T09:00:00.000Z'),
        verzending('subsidie_huur', '2026-03-04T09:00:00.000Z'),
        verzending('plan_bewoner_huur', '2026-03-05T09:00:00.000Z'),
        verzending('plan_corporatie', '2026-03-06T09:00:00.000Z'),
        verzending('oplever_bewoner', '2026-03-08T09:00:00.000Z'),
        verzending('oplever_corporatie', '2026-03-09T09:00:00.000Z'),
      ],
    });
    expect(exporteer(d)).toMatchObject({ Subsidiemail: '2026-03-03', 'Plan verstuurd naar bewoner': '2026-03-05', 'Plan verstuurd naar woningcorporatie': '2026-03-06', 'Opleverrapport verstuurd': '2026-03-08' });
  });

  it('fills Akkoord from the corporatie for huur and from the Klussendienst choice for koop', () => {
    expect(exporteer(naInschrijving('huur', { corporatie_akkoord_at: '2026-03-12T09:00:00.000Z' })).Akkoord).toBe('2026-03-12');
    expect(exporteer(naInschrijving('koop', { klussendienst_gekozen_at: '2026-03-13T09:00:00.000Z' })).Akkoord).toBe('2026-03-13');
  });

  it('writes the closing date and reason', () => {
    const d = naInschrijving('koop', { gesloten_at: '2026-03-20T09:00:00.000Z', gesloten_reden: 'Bewoner afgehaakt' });
    expect(exporteer(d)).toMatchObject({ Gesloten: '2026-03-20', 'Reden gesloten': 'Bewoner afgehaakt', Status: expect.stringMatching(/Gesloten/) as string });
  });

  it('sums the dak m² with one decimal and a comma, skipping daken without a size', () => {
    const d = dossier({
      data: {
        kaart_annotaties: [
          { id: 'd1', type: 'dak', p: [[0, 0], [1, 0], [1, 1]] },
          { id: 'd2', type: 'dak', p: [[5, 5], [6, 5], [6, 6]] },
          { id: 'd3', type: 'dak', p: [[9, 9], [8, 9], [8, 8]] },
        ],
        'dak.d1.m2': 20.25,
        'dak.d2.m2': 12.1,
      },
    });
    expect(exporteer(d)['Dak m² (totaal)']).toBe('32,4');
  });

  it('counts regenpijpen and the ones where a regenton is gewenst', () => {
    const d = dossier({
      data: {
        kaart_annotaties: [{ id: 'r1', type: 'regenpijp', p: [[0, 0]] }, { id: 'r2', type: 'regenpijp', p: [[1, 1]] }, { id: 'r3', type: 'regenpijp', p: [[2, 2]] }],
        'regenpijp.r1.regenton': 'gewenst', 'regenpijp.r2.regenton': 'aanwezig', 'regenpijp.r3.regenton': 'gewenst',
      },
    });
    expect(exporteer(d)).toMatchObject({ 'Aantal regenpijpen': '3', 'Regentonnen gewenst': '2' });
  });

  it('writes material costs in euros with a decimal comma, counting only rows with both price and amount', () => {
    const d = dossier({
      data: {
        materialen: ['m1', 'm2', 'm3'],
        'materiaal.m1.naam': 'Regenton', 'materiaal.m1.prijs': 4500, 'materiaal.m1.aantal': 2,
        'materiaal.m2.naam': 'Beugel', 'materiaal.m2.prijs': 333, 'materiaal.m2.aantal': 1.5,
        'materiaal.m3.naam': 'Zonder aantal', 'materiaal.m3.prijs': 999,
        gebruikt: ['g1'], 'gebruikt.g1.naam': 'Regenton', 'gebruikt.g1.prijs': 4500, 'gebruikt.g1.aantal': 1,
      },
    });
    expect(exporteer(d)).toMatchObject({ 'Geschatte materiaalkosten': '95', 'Gebruikte materiaalkosten': '45' });
    const centen = dossier({ data: { materialen: ['m1'], 'materiaal.m1.naam': 'x', 'materiaal.m1.prijs': 1999, 'materiaal.m1.aantal': 3 } });
    expect(exporteer(centen)['Geschatte materiaalkosten']).toBe('59,97');
  });

  it('keeps user text with semicolons, quotes and line breaks in one cell', () => {
    const d = naInschrijving('huur', { data: { ...naInschrijving('huur').data, bewoner_naam: 'Jan "Jantje"; de Vries\nachterhuis' } });
    expect(exporteer(d)['Bewoner naam']).toBe('Jan "Jantje"; de Vries\nachterhuis');
  });
});

describe('GET /api/dossiers.csv', () => {
  let t: TestApp;
  let bea: Klant;
  beforeEach(async () => {
    t = testApp();
    maakGebruiker(t, 'Bea Beheer', 'beheerder');
    const kees = maakGebruiker(t, 'Kees Klus', 'klusser');
    bea = await new Klant(t).login('bea.beheer@example.org');
    const id = await nieuwDossier(bea);
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: kees });
  });
  // Response.text() would strip the BOM that Excel needs, so the bytes are decoded as they are.
  const download = async (q: string) => lees(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await (await bea.verzoek('GET', `/api/dossiers.csv${q}`)).arrayBuffer()));

  it('is refused to a klusser, also one assigned to a dossier', async () => {
    const kees = await new Klant(t).login('kees.klus@example.org');
    const res = await kees.verzoek('GET', '/api/dossiers.csv');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ fout: 'Alleen voor beheerders' });
  });

  it('is refused to an admin while "Inloggen als" a klusser', async () => {
    await bea.json('POST', '/api/auth/als/2');
    expect((await bea.verzoek('GET', '/api/dossiers.csv')).status).toBe(403);
  });

  it("downloads as a dated attachment in UTF-8", async () => {
    const res = await bea.verzoek('GET', '/api/dossiers.csv');
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="dossiers-2026-03-02.csv"');
  });

  it('exports what the list filter shows, in the chosen order', async () => {
    const tweede = await nieuwDossier(bea, 'koop');
    await bea.json('POST', `/api/dossiers/${tweede}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });
    const ids = async (q: string) => (await download(q)).slice(1).map((r) => r[0]);
    expect(await ids('')).toEqual(['1']);
    expect(await ids('?s_gesloten=alle&sorteer=oud')).toEqual(['1', '2']);
    expect(await ids('?s_gesloten=alle&sorteer=nieuw')).toEqual(['2', '1']);
    expect(await ids('?s_gesloten=alle&bezoeker=2')).toEqual(['1']);
  });

  it('exports only the header when nothing matches', async () => {
    const rijen = await download('?adres=bestaatniet');
    expect(rijen).toHaveLength(1);
    expect(rijen[0][0]).toBe('Dossier-ID');
  });
});

describe('GET /api/dossiers eigenaar filter', () => {
  it('offers the active beheerders and lists only the dossiers the chosen one owns', async () => {
    const t = testApp();
    const bea = maakGebruiker(t, 'Bea Beheer', 'beheerder');
    const bob = maakGebruiker(t, 'Bob Beheer', 'beheerder');
    maakGebruiker(t, 'Kees Klus', 'klusser');
    const oud = maakGebruiker(t, 'Oud Beheer', 'beheerder');
    t.ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(t.ctx.klok.iso(), oud);
    const beaKlant = await new Klant(t).login('bea.beheer@example.org');
    const vanBea = await nieuwDossier(beaKlant);
    const vanBob = await nieuwDossier(await new Klant(t, '10.0.0.2').login('bob.beheer@example.org'));
    const lijst = (q: string) => beaKlant.json<{ rijen: { id: number }[]; opties: { beheerders: { id: number; naam: string }[] } }>('GET', `/api/dossiers${q}`);

    expect((await lijst('')).opties.beheerders).toEqual([{ id: bea, naam: 'Bea Beheer' }, { id: bob, naam: 'Bob Beheer' }]);
    expect((await lijst('')).rijen.map((r) => r.id).sort()).toEqual([vanBea, vanBob].sort());
    expect((await lijst(`?eigenaar=${bob}`)).rijen.map((r) => r.id)).toEqual([vanBob]);
    expect((await lijst(`?eigenaar=${bea}`)).rijen.map((r) => r.id)).toEqual([vanBea]);
  });
});

describe('filter() ligt bij', () => {
  it('finds a dossier waiting on its bezoeker under Bezoeker, not under Beheerder', () => {
    const wachtOpBezoeker = naInschrijving('huur', { id: 1, bezoeker_id: 7, bezoeker_toegewezen_at: '2026-03-03T09:00:00.000Z' });
    const wachtOpBeheerder = naInschrijving('huur', { id: 2 });
    const alle = [wachtOpBezoeker, wachtOpBeheerder];
    const rijen = new Map(alle.map((d) => [d.id, lijstRij(d, GM, NU, BEHEERDER)]));
    const ids = (ligt_bij: string) => filter(alle, rijen, leesFilters({ ligt_bij }), NU).map((d) => d.id);
    expect(ids('bezoeker')).toEqual([1]);
    expect(ids('beheerder')).toEqual([2]);
    expect(ids('uitvoerder')).toEqual([]);
  });
});
