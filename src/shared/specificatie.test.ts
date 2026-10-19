import { describe, expect, it } from 'vitest';
import { geenSpecificatie, specificatie, specificatieTekst } from './specificatie.ts';
import { naInschrijving } from './testhulp.ts';
import type { Dossier } from './types.ts';

// The gebruikte materialen from the example the administratie sent, with one afgekoppelde regenpijp out of two.
const GEBRUIKT: [string, number | null, number | null][] = [
  ['Rubberen ring', 195, 3],
  ['Vulautomaat', 1061, 1],
  ['Bladvanger', 3091, 1],
  ['Flexibele buis 50 mm blind, per meter', 250, 0.5],
  ['Mof x verjongd spie 80 mm', 292, 1],
  ['Regenton 210 liter', 4500, null],
];

function opgeleverd(huur_koop: 'huur' | 'koop', over: Partial<Dossier> = {}): Dossier {
  const d = naInschrijving(huur_koop, { werk_opgeleverd_at: '2026-10-08T10:00:00.000Z', klussendienst_gekozen_at: huur_koop === 'koop' ? '2026-09-01T10:00:00.000Z' : null, ...over });
  d.data.gebruikt = GEBRUIKT.map((_, i) => `g${i}`);
  GEBRUIKT.forEach(([naam, prijs, aantal], i) => Object.assign(d.data, { [`gebruikt.g${i}.naam`]: naam, [`gebruikt.g${i}.prijs`]: prijs, [`gebruikt.g${i}.aantal`]: aantal }));
  d.data.kaart_annotaties = [{ id: 'r1', type: 'regenpijp', p: [[1, 1]] }, { id: 'r2', type: 'regenpijp', p: [[5, 5]] }] as unknown as string[];
  d.data['regenpijp.r1.afkoppelen'] = 'ja';
  d.data['regenpijp.r2.afkoppelen'] = 'nee';
  return d;
}

describe('uitvoeringsspecificatie', () => {
  it('matches the administratie example: materials plus € 50 per afgekoppelde regenpijp, btw 21% over the subtotaal', () => {
    const s = specificatie(opgeleverd('koop'));
    expect(s.regels.map((r) => r.naam)).toEqual(GEBRUIKT.slice(0, 5).map(([n]) => n));
    expect(s.regels.map((r) => r.bedrag)).toEqual([585, 1061, 3091, 125, 292]);
    expect(s.klussendienst).toEqual({ pijpen: 1, bedrag: 5000 });
    expect([s.subtotaal, s.btw, s.totaal]).toEqual([10154, 2132, 12286]);
    expect(s.waarschuwingen).toEqual([]);
  });

  it('charges the Klussendienst for a huurwoning too', () => {
    const s = specificatie(opgeleverd('huur'));
    expect(s.klussendienst).toEqual({ pijpen: 1, bedrag: 5000 });
    expect(s.totaal).toBe(12286);
  });

  it('warns about a used material without a price and a koop job with no afgekoppelde regenpijp', () => {
    const d = opgeleverd('koop');
    d.data['gebruikt.g0.prijs'] = null;
    d.data['regenpijp.r1.afkoppelen'] = 'twijfel';
    const s = specificatie(d);
    expect(s.regels[0].bedrag).toBeNull();
    expect(s.subtotaal).toBe(5154 - 585);
    expect(s.waarschuwingen).toHaveLength(2);
    expect(s.waarschuwingen[0]).toContain('Rubberen ring heeft geen prijs');
    expect(s.waarschuwingen[1]).toContain('Afkoppelen: Ja');
  });

  it('is refused before oplevering and for a koopwoning without the Klussendienst', () => {
    expect(geenSpecificatie(opgeleverd('koop'))).toBeNull();
    expect(geenSpecificatie(opgeleverd('huur'))).toBeNull();
    expect(geenSpecificatie(opgeleverd('koop', { werk_opgeleverd_at: null }))).toMatch(/Werk opgeleverd/);
    expect(geenSpecificatie(opgeleverd('koop', { klussendienst_gekozen_at: null }))).toMatch(/niet voor de Klussendienst gekozen/);
  });

  it('writes copyable text with labelled details, the lines and the totals', () => {
    const t = specificatieTekst(opgeleverd('koop'), 'Piet');
    expect(t).toContain('Uitvoeringsspecificatie\n\nProject: Klimaatadaptatie Deventer\nBewoner: Anna de Vries\nAdres: Walstraat 74, 7411GK Deventer\nE-mail bewoner: anna@example.org\nWoningeigenaar: Bewoner (koopwoning)\nUitvoerder: Piet\nOpgeleverd op: ');
    expect(specificatieTekst(opgeleverd('koop', { data: {} }), null)).toContain('Bewoner: --\nAdres: Walstraat 74, 7411GK Deventer\nE-mail bewoner: --\nWoningeigenaar: Bewoner (koopwoning)\nUitvoerder: --');
    expect(t).toContain('3 × Rubberen ring à € 1,95: € 5,85');
    expect(t).toContain('0,5 × Flexibele buis 50 mm blind, per meter à € 2,50: € 1,25');
    expect(t).toContain('Klussendienst: 1 regenpijp afgekoppeld × € 50,00: € 50,00');
    expect(t).toContain('Subtotaal: € 101,54\nbtw 21%: € 21,32\nTotaal: € 122,86');
    expect(t).not.toContain('Regenton');
    expect(t).not.toContain('LET OP');
  });
});
