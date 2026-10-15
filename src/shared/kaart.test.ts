import { describe, expect, it } from 'vitest';
import {
  afstandTotLijn, afstandTotPolygoon, annotatieLabels, annotatiesSvg, binnen, dichtstbijzijndeDak, getal, isAnnotatieLijst, kaartItems, letter, oppervlakPx, waterberging, zijdeLengtes,
} from './kaart.ts';
import { ontbrekend } from './velden.ts';
import { dossier } from './testhulp.ts';
import type { Annotatie, Foto } from './types.ts';

const vierkant = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const kaart = (m_per_px: number | null): Foto => ({ id: 'f1', slot: 'kaart', breedte: 1000, hoogte: 1000, m_per_px, annotaties: [], created_at: '2026-03-01T00:00:00.000Z' });

describe('labels', () => {
  it('numbers daken and tuinen and letters regenpijpen by order', () => {
    const a: Annotatie[] = [
      { id: 'd1', type: 'dak', p: vierkant(0, 0, 10) },
      { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
      { id: 'd2', type: 'dak', p: vierkant(20, 0, 10) },
      { id: 't1', type: 'tuin', p: vierkant(0, 50, 10) },
      { id: 'r2', type: 'regenpijp', p: [[21, 1]] },
    ];
    expect([...annotatieLabels(a)]).toEqual([['d1', 'D1'], ['r1', 'A'], ['d2', 'D2'], ['t1', 'T1'], ['r2', 'B']]);
  });

  it('renumbers after a delete while IDs stay put', () => {
    const a: Annotatie[] = [{ id: 'x', type: 'dak', p: [] }, { id: 'y', type: 'dak', p: [] }];
    expect(annotatieLabels(a.slice(1)).get('y')).toBe('D1');
  });

  it('continues past Z with AA, and past ZZ with AAA', () => {
    expect([letter(0), letter(25), letter(26), letter(27), letter(701), letter(702)]).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('letters regenpijpen and gives pijlen and tekst no label', () => {
    const a: Annotatie[] = [{ id: 'p1', type: 'pijl', p: [] }, { id: 'r1', type: 'regenpijp', p: [] }, { id: 'x1', type: 'tekst', p: [], tekst: 'hier' }, { id: 'r2', type: 'regenpijp', p: [] }];
    expect([...annotatieLabels(a)]).toEqual([['r1', 'A'], ['r2', 'B']]);
  });

  it('numbers terrassen TR1, TR2 apart from tuinen', () => {
    const a: Annotatie[] = [{ id: 'x1', type: 'terras', p: [] }, { id: 't1', type: 'tuin', p: [] }, { id: 'x2', type: 'terras', p: [] }];
    expect([...annotatieLabels(a)]).toEqual([['x1', 'TR1'], ['t1', 'T1'], ['x2', 'TR2']]);
  });
});

describe('geometry', () => {
  // An L shape whose notch, around (15, 15), lies outside it.
  const L: [number, number][] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];

  it('measures the area of a polygon drawn either way round, and of fewer than three points as zero', () => {
    expect(oppervlakPx(vierkant(0, 0, 10))).toBe(100);
    expect(oppervlakPx(vierkant(0, 0, 10).reverse())).toBe(100);
    expect(oppervlakPx(L)).toBe(300);
    expect([oppervlakPx([]), oppervlakPx([[1, 1]]), oppervlakPx([[0, 0], [5, 5]])]).toEqual([0, 0, 0]);
  });

  it('tells inside from outside, also in the notch of a concave shape', () => {
    expect(binnen([5, 5], L)).toBe(true);
    expect(binnen([15, 5], L)).toBe(true);
    expect(binnen([15, 15], L)).toBe(false);
    expect(binnen([-1, 5], L)).toBe(false);
    expect(binnen([5, 5], [])).toBe(false);
  });

  it('measures the distance to a segment from beside it, past its ends, and to a single point', () => {
    expect(afstandTotLijn([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(afstandTotLijn([13, 4], [0, 0], [10, 0])).toBe(5);
    expect(afstandTotLijn([-3, -4], [0, 0], [10, 0])).toBe(5);
    expect(afstandTotLijn([3, 4], [0, 0], [0, 0])).toBe(5);
  });

  it('measures zero inside a polygon and the nearest edge outside it, also from the notch', () => {
    expect(afstandTotPolygoon([5, 5], L)).toBe(0);
    expect(afstandTotPolygoon([15, 13], L)).toBe(3);
    expect(afstandTotPolygoon([25, 5], L)).toBe(5);
  });

  it('measures side lengths in meters, including the closing side', () => {
    expect(zijdeLengtes([[0, 0], [30, 0], [30, 40]], 0.5)).toEqual([15, 20, 25]);
  });

  it('writes numbers the Dutch way with at most one decimal', () => {
    expect([getal(1234.56), getal(12), getal(0.04)]).toEqual(['1.234,6', '12', '0']);
  });
});

describe('dichtstbijzijndeDak', () => {
  const dak = (id: string, p: [number, number][]): Annotatie => ({ id, type: 'dak', p });

  it('picks no dak when there are none', () => {
    expect(dichtstbijzijndeDak([0, 0], [])).toBeNull();
  });

  it('picks the dak the point lies in, over one whose edge is closer', () => {
    const groot = dak('groot', vierkant(0, 0, 100));
    const klein = dak('klein', vierkant(52, 52, 4));
    expect(dichtstbijzijndeDak([50, 50], [groot, klein])).toBe('groot');
  });

  it('picks the nearest dak from outside, and the first one on a tie', () => {
    const a = dak('a', vierkant(0, 0, 10));
    const b = dak('b', vierkant(30, 0, 10));
    expect(dichtstbijzijndeDak([25, 5], [a, b])).toBe('b');
    expect(dichtstbijzijndeDak([20, 5], [a, b])).toBe('a');
    expect(dichtstbijzijndeDak([20, 5], [b, a])).toBe('b');
  });

  it('ignores a dak without points', () => {
    expect(dichtstbijzijndeDak([5, 5], [dak('leeg', []), dak('echt', vierkant(100, 100, 10))])).toBe('echt');
  });
});

describe('isAnnotatieLijst', () => {
  it('accepts an empty list and every annotation type', () => {
    expect(isAnnotatieLijst([])).toBe(true);
    expect(isAnnotatieLijst(['pijl', 'tekst', 'dak', 'tuin', 'terras', 'regenpijp'].map((type, i) => ({ id: `a${i}`, type, p: [[1, 2]], ...(type === 'tekst' ? { tekst: 'x' } : {}) })))).toBe(true);
  });

  it('refuses anything that would break drawing or the PDFs', () => {
    for (const fout of [
      null, {}, 'x', [null], [[]],
      [{ type: 'dak', p: [] }],
      [{ id: 1, type: 'dak', p: [] }],
      [{ id: 'a', type: 'cirkel', p: [] }],
      [{ id: 'a', type: 'dak' }],
      [{ id: 'a', type: 'dak', p: [[1]] }],
      [{ id: 'a', type: 'dak', p: [[1, 2, 3]] }],
      [{ id: 'a', type: 'dak', p: [[1, '2']] }],
      [{ id: 'a', type: 'dak', p: [[1, null]] }],
      [{ id: 'a', type: 'tekst', p: [[1, 2]], tekst: 5 }],
    ]) expect(isAnnotatieLijst(fout), JSON.stringify(fout)).toBe(false);
  });
});

describe('kaartItems', () => {
  it('computes m² on a scaled kaart and links each regenpijp to the dak it sits in or nearest to', () => {
    const d = dossier({
      fotos: [kaart(0.1)],
      data: {
        kaart_annotaties: [
          { id: 'd1', type: 'dak', p: vierkant(0, 0, 60) },
          { id: 'd2', type: 'dak', p: vierkant(100, 0, 60) },
          { id: 'r1', type: 'regenpijp', p: [[30, 30]] },
          { id: 'r2', type: 'regenpijp', p: [[95, 10]] },
        ],
      },
    });
    const k = kaartItems(d);
    expect(oppervlakPx(vierkant(0, 0, 60))).toBe(3600);
    expect(k.daken.map((x) => [x.label, x.m2, x.regenpijpen])).toEqual([['D1', 36, ['r1']], ['D2', 36, ['r2']]]);
  });

  it('honours a manual dak choice and falls back to the nearest when that dak is gone', () => {
    const anns = [
      { id: 'd1', type: 'dak', p: vierkant(0, 0, 60) },
      { id: 'd2', type: 'dak', p: vierkant(100, 0, 60) },
      { id: 'r1', type: 'regenpijp', p: [[30, 30]] },
    ];
    const d = dossier({ data: { kaart_annotaties: anns, 'regenpijp.r1.dak': 'd2' } });
    expect(kaartItems(d).regenpijpen[0]).toMatchObject({ dak: 'd2', dakAutomatisch: false });
    d.data['regenpijp.r1.dak'] = 'weg';
    expect(kaartItems(d).regenpijpen[0]).toMatchObject({ dak: 'd1', dakAutomatisch: true });
  });

  it('uses the manual m² on an unscaled kaart', () => {
    const d = dossier({ fotos: [kaart(null)], data: { kaart_annotaties: [{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }], 'dak.d1.m2': 18 } });
    expect(kaartItems(d).daken[0]).toMatchObject({ m2: 18, m2Berekend: false });
  });

  it('measures terrassen on a scaled kaart and takes the manual m² on an unscaled one', () => {
    const anns = [{ id: 'x1', type: 'terras', p: vierkant(0, 0, 30) }];
    expect(kaartItems(dossier({ fotos: [kaart(0.1)], data: { kaart_annotaties: anns } })).terrassen).toEqual([{ id: 'x1', label: 'TR1', m2: 9, m2Berekend: true }]);
    expect(kaartItems(dossier({ fotos: [kaart(null)], data: { kaart_annotaties: anns, 'terras.x1.m2': 12 } })).terrassen[0]).toMatchObject({ m2: 12, m2Berekend: false });
  });
});

describe('waterberging', () => {
  it('splits the dak over its regenpijpen at the normafvoer, with the sum shown', () => {
    expect(waterberging({ id: 'd', label: 'D1', m2: 18, m2Berekend: true, regenpijpen: ['a', 'b'] })).toEqual({ liter: 180, uitleg: '18 m² ÷ 2 × 20 mm = 180 liter' });
  });

  it('gives nothing for a dak without a regenpijp', () => {
    expect(waterberging({ id: 'd', label: 'D1', m2: 18, m2Berekend: true, regenpijpen: [] })).toBeNull();
  });
});

describe('annotatiesSvg', () => {
  it('draws labels and the area of a scaled dak', () => {
    const svg = annotatiesSvg([{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }], { schaal: 1, mPerPx: 0.1 });
    expect(svg).toContain('>D1</text>');
    expect(svg).toContain('>36 m²</text>');
    expect(svg).toContain('>6 m</text>');
  });

  it('draws a terras as a red polygon with its label, area and sides', () => {
    const svg = annotatiesSvg([{ id: 'x1', type: 'terras', p: vierkant(0, 0, 30) }], { schaal: 1, mPerPx: 0.1 });
    expect(svg).toContain('<polygon points="0,0 30,0 30,30 0,30" fill="#e5383b"');
    expect(svg).toContain('>TR1</text>');
    expect(svg).toContain('>9 m²</text>');
    expect(svg).toContain('>3 m</text>');
  });

  it('draws a pijl without a label, its line ending inside the head so the round cap stays behind the tip', () => {
    const svg = annotatiesSvg([{ id: 'p', type: 'pijl', p: [[0, 0], [100, 0]] }], { schaal: 1, mPerPx: null });
    expect(svg).not.toContain('<text');
    const x2 = Number(/<line [^>]*x2="([\d.]+)"/.exec(svg)![1]);
    const breed = Number(/<line [^>]*stroke-width="([\d.]+)"/.exec(svg)![1]);
    expect(x2 + breed / 2).toBeLessThan(100);
    expect(x2).toBeGreaterThan(100 - 14 * Math.cos(0.45));
  });

  it('escapes free text', () => {
    expect(annotatiesSvg([{ id: 't', type: 'tekst', p: [[1, 1]], tekst: '<b>' }], { schaal: 1, mPerPx: null })).toContain('&lt;b&gt;');
  });

  it('draws free text at 14 × 1.21 units, scaled with schaal', () => {
    const svg = annotatiesSvg([{ id: 't', type: 'tekst', p: [[1, 1]], tekst: 'Deur' }], { schaal: 2, mPerPx: null });
    expect(Number(/font-size="([\d.]+)"/.exec(svg)![1])).toBeCloseTo(14 * 1.21 * 2);
  });
});

describe('ontbrekend (Controle)', () => {
  it('lists the kaart and per-regenpijp gaps on the Bezoek page', () => {
    const d = dossier({ data: { kaart_annotaties: [{ id: 'd1', type: 'dak', p: vierkant(0, 0, 10) }, { id: 'r1', type: 'regenpijp', p: [[5, 5]] }], 'regenpijp.r1.regenton': 'gewenst' } });
    const labels = ontbrekend(d, 'bezoek').map((o) => o.label);
    expect(labels).toContain('Tuin intekenen op de kaart');
    expect(labels).toContain('D1: m²');
    expect(labels).toContain('Regenpijp A: Hoe is de ondergrond bij de pijp?');
    expect(labels).not.toContain('Regenpijp A: Regenton aanwezig?');
  });

  it('never asks for a terras, but asks for the m² of a drawn one on an unscaled kaart', () => {
    const d = dossier({ fotos: [kaart(null)], data: { kaart_annotaties: [{ id: 't1', type: 'tuin', p: vierkant(0, 0, 10) }] } });
    expect(ontbrekend(d, 'bezoek').map((o) => o.label).filter((l) => l.includes('TR') || /terras/i.test(l))).toEqual([]);
    d.data.kaart_annotaties = [{ id: 'x1', type: 'terras', p: vierkant(0, 0, 10) }];
    expect(ontbrekend(d, 'bezoek')).toContainEqual({ label: 'TR1: m²', anker: 'veld-terras.x1.m2' });
  });

  it('asks for the write-in when Anders is chosen', () => {
    const d = dossier({ data: { kaart_annotaties: [{ id: 'r1', type: 'regenpijp', p: [[5, 5]] }], 'regenpijp.r1.soort': 'anders' } });
    expect(ontbrekend(d, 'bezoek').map((o) => o.label)).toContain('Regenpijp A: Soort');
    d.data['regenpijp.r1.soort_anders'] = 'Koper';
    expect(ontbrekend(d, 'bezoek').map((o) => o.label)).not.toContain('Regenpijp A: Soort');
  });

  it('nudges for a toelichting unless the beoordeling is Wensen uitvoerbaar', () => {
    const d = dossier({ data: { beoordeling: 'deels' } });
    expect(ontbrekend(d, 'plan').map((o) => o.label)).toContain('Toelichting bij de beoordeling');
    d.data.beoordeling = 'uitvoerbaar';
    expect(ontbrekend(d, 'plan').map((o) => o.label)).not.toContain('Toelichting bij de beoordeling');
  });
});
