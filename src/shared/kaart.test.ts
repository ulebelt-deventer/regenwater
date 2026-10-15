import { describe, expect, it } from 'vitest';
import {
  type DakDeel, afstandTotLijn, afstandTotPolygoon, annotatieLabels, annotatiesSvg, binnen, bronnenTekst, dichtstbijzijndeDak, dichtstbijzijndeVerdeling, getal, herverdeel, isAnnotatieLijst,
  kaartItems, letter, oppervlakPx, procenten, verdelingTekst, verdelingVoor, verdelingWaarde, verdelingenTeWissen, waterberging, zijdeLengtes,
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

  it('numbers stenen S1, S2 apart from tuinen', () => {
    const a: Annotatie[] = [{ id: 'x1', type: 'steen', p: [] }, { id: 't1', type: 'tuin', p: [] }, { id: 'x2', type: 'steen', p: [] }];
    expect([...annotatieLabels(a)]).toEqual([['x1', 'S1'], ['t1', 'T1'], ['x2', 'S2']]);
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
    expect(isAnnotatieLijst(['pijl', 'tekst', 'dak', 'tuin', 'steen', 'regenpijp'].map((type, i) => ({ id: `a${i}`, type, p: [[1, 2]], ...(type === 'tekst' ? { tekst: 'x' } : {}) })))).toBe(true);
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
    expect(k.daken.map((x) => [x.label, x.m2, x.verdeling, x.automatisch])).toEqual([['D1', 36, [{ pijp: 'r1', pct: 100 }], true], ['D2', 36, [{ pijp: 'r2', pct: 100 }], true]]);
    expect(k.regenpijpen.map((r) => r.bronnen)).toEqual([[{ dak: 'd1', pct: 100 }], [{ dak: 'd2', pct: 100 }]]);
    expect(k.daken[0].afstandM.get('r2')).toBeCloseTo(3.5);
  });

  // 0.1 m per px, so KOPPEL_M is 10 px. The daken are 5 px apart.
  const tweeDaken = (pijp: [number, number]) => [
    { id: 'd1', type: 'dak', p: vierkant(0, 0, 60) },
    { id: 'd2', type: 'dak', p: vierkant(65, 0, 60) },
    { id: 'r1', type: 'regenpijp', p: [pijp] },
  ];

  it('links a regenpijp to every dakdeel within 1 m, and else to the nearest one only', () => {
    const bronnen = (pijp: [number, number], fotos: Foto[]) => kaartItems(dossier({ fotos, data: { kaart_annotaties: tweeDaken(pijp) } })).regenpijpen[0].bronnen;
    expect(bronnen([62, 30], [kaart(0.1)])).toEqual([{ dak: 'd1', pct: 100 }, { dak: 'd2', pct: 100 }]);
    expect(bronnen([200, 30], [kaart(0.1)])).toEqual([{ dak: 'd2', pct: 100 }]);
    expect(bronnen([62, 30], [kaart(null)])).toEqual([{ dak: 'd1', pct: 100 }]);
  });

  it('splits a dakdeel between its regenpijpen by which one each part is nearest to', () => {
    const d = dossier({ fotos: [kaart(0.1)], data: { kaart_annotaties: [{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }, { id: 'r1', type: 'regenpijp', p: [[0, 0]] }, { id: 'r2', type: 'regenpijp', p: [[40, 0]] }] } });
    expect(kaartItems(d).daken[0].verdeling).toEqual([{ pijp: 'r1', pct: 33 }, { pijp: 'r2', pct: 67 }]);
  });

  it('leaves a linked regenpijp out of the automatic split when no part of the dakdeel is nearest to it', () => {
    const d = dossier({ fotos: [kaart(0.1)], data: { kaart_annotaties: [{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }, { id: 'r1', type: 'regenpijp', p: [[0, 30]] }, { id: 'r2', type: 'regenpijp', p: [[-9, 30]] }] } });
    expect(kaartItems(d).daken[0].verdeling).toEqual([{ pijp: 'r1', pct: 100 }]);
    expect(verdelingVoor(d, 'd1', ['r1', 'r2'])).toEqual([{ pijp: 'r1', pct: 99 }, { pijp: 'r2', pct: 1 }]);
  });

  it('honours a hand-set verdeling, {} as no regenpijp, and falls back to the automatic one when a regenpijp in it is gone', () => {
    const d = dossier({ fotos: [kaart(0.1)], data: { kaart_annotaties: [...tweeDaken([30, 30]), { id: 'r2', type: 'regenpijp', p: [[40, 30]] }], 'dak.d1.verdeling': { r2: 30, r1: 70 } } });
    expect(kaartItems(d).daken[0]).toMatchObject({ verdeling: [{ pijp: 'r1', pct: 70 }, { pijp: 'r2', pct: 30 }], automatisch: false, verlopen: false });
    expect(kaartItems(d).regenpijpen[1].bronnen).toEqual([{ dak: 'd1', pct: 30 }]);
    d.data['dak.d1.verdeling'] = {};
    expect(kaartItems(d).daken[0]).toMatchObject({ verdeling: [], automatisch: false });
    expect(ontbrekend(d, 'bezoek')).toContainEqual({ label: 'D1: geen regenpijp', anker: 'veld-dak.d1.verdeling' });
    d.data['dak.d1.verdeling'] = { weg: 50, r1: 50 };
    expect(kaartItems(d).daken[0]).toMatchObject({ verdeling: kaartItems(d).daken[0].automatischeVerdeling, automatisch: true, verlopen: true });
    expect(ontbrekend(d, 'bezoek')).toContainEqual({ label: 'D1: verdeling opnieuw controleren', anker: 'veld-dak.d1.verdeling' });
  });

  it('uses the manual m² on an unscaled kaart', () => {
    const d = dossier({ fotos: [kaart(null)], data: { kaart_annotaties: [{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }], 'dak.d1.m2': 18 } });
    expect(kaartItems(d).daken[0]).toMatchObject({ m2: 18, m2Berekend: false });
  });

  it('measures stenen on a scaled kaart and takes the manual m² on an unscaled one', () => {
    const anns = [{ id: 'x1', type: 'steen', p: vierkant(0, 0, 30) }];
    expect(kaartItems(dossier({ fotos: [kaart(0.1)], data: { kaart_annotaties: anns } })).stenen).toEqual([{ id: 'x1', label: 'S1', m2: 9, m2Berekend: true }]);
    expect(kaartItems(dossier({ fotos: [kaart(null)], data: { kaart_annotaties: anns, 'steen.x1.m2': 12 } })).stenen[0]).toMatchObject({ m2: 12, m2Berekend: false });
  });
});

describe('verdeling', () => {
  // The L from 'geometry', symmetric about y = x.
  const L: [number, number][] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];

  it('rounds to whole percents that add up to the total, evenly for all-zero weights', () => {
    expect(procenten([1, 1, 1])).toEqual([34, 33, 33]);
    expect(procenten([0, 0])).toEqual([50, 50]);
    expect(procenten([3, 1], 20)).toEqual([15, 5]);
    expect(procenten([])).toEqual([]);
  });

  it('gives one regenpijp all of the dakdeel, also from outside it', () => {
    expect(dichtstbijzijndeVerdeling(vierkant(0, 0, 60), [[-5, 30]])).toEqual([100]);
  });

  it('splits by the nearest regenpijp: evenly on a symmetric shape, by area on a concave one', () => {
    expect(dichtstbijzijndeVerdeling(vierkant(0, 0, 60), [[0, 30], [60, 30]])).toEqual([50, 50]);
    expect(dichtstbijzijndeVerdeling(L, [[20, 5], [5, 20]])).toEqual([50, 50]);
    // The bisector 4x + y = 42.5 leaves 137.5 of the L's 300 to (20, 5).
    expect(dichtstbijzijndeVerdeling(L, [[0, 0], [20, 5]])).toEqual([54, 46]);
  });

  it('splits evenly between regenpijpen on the same spot, and always adds up to 100', () => {
    expect(dichtstbijzijndeVerdeling(vierkant(0, 0, 60), [[5, 5], [5, 5]])).toEqual([50, 50]);
    for (const pijpen of [[[0, 0], [60, 0], [30, 60]], [[1, 2], [3, 50], [59, 59], [30, 30]], [[0, 0], [0, 0], [60, 60]]] as [number, number][][]) {
      expect(dichtstbijzijndeVerdeling(L, pijpen).reduce((s, p) => s + p, 0)).toBe(100);
    }
  });

  it('sets one percent and scales the others to the rest, keeping their ratio', () => {
    expect(herverdeel([{ pijp: 'a', pct: 50 }, { pijp: 'b', pct: 30 }, { pijp: 'c', pct: 20 }], 'a', 80)).toEqual([{ pijp: 'a', pct: 80 }, { pijp: 'b', pct: 12 }, { pijp: 'c', pct: 8 }]);
    expect(herverdeel([{ pijp: 'a', pct: 100 }, { pijp: 'b', pct: 0 }, { pijp: 'c', pct: 0 }], 'a', 40)).toEqual([{ pijp: 'a', pct: 40 }, { pijp: 'b', pct: 30 }, { pijp: 'c', pct: 30 }]);
  });

  it('drops a regenpijp that ends at 0%, clamps to 0-100, and keeps a lone regenpijp at 100%', () => {
    const twee = [{ pijp: 'a', pct: 60 }, { pijp: 'b', pct: 40 }];
    expect(herverdeel(twee, 'a', 150)).toEqual([{ pijp: 'a', pct: 100 }]);
    expect(herverdeel(twee, 'a', -5)).toEqual([{ pijp: 'b', pct: 100 }]);
    expect(herverdeel([{ pijp: 'a', pct: 100 }], 'a', 40)).toEqual([{ pijp: 'a', pct: 100 }]);
    expect(() => herverdeel(twee, 'x', 10)).toThrow('hoort niet bij');
  });

  // On an unscaled kaart: r1 drains D1 and r2 drains D2.
  const tweeDaken = [
    { id: 'd1', type: 'dak', p: vierkant(0, 0, 60) },
    { id: 'd2', type: 'dak', p: vierkant(100, 0, 60) },
    { id: 'r1', type: 'regenpijp', p: [[0, 30]] },
    { id: 'r2', type: 'regenpijp', p: [[130, 30]] },
  ];

  it('stores null while the verdeling equals the automatic one, {} for none', () => {
    const dak = kaartItems(dossier({ data: { kaart_annotaties: tweeDaken } })).daken[0];
    expect(dak.automatischeVerdeling).toEqual([{ pijp: 'r1', pct: 100 }]);
    expect(verdelingWaarde(dak, [{ pijp: 'r1', pct: 100 }])).toBeNull();
    expect(verdelingWaarde(dak, [{ pijp: 'r1', pct: 50 }, { pijp: 'r2', pct: 50 }])).toEqual({ r1: 50, r2: 50 });
    expect(verdelingWaarde(dak, [])).toEqual({});
  });

  it('writes the verdeling per dakdeel and the bronnen per regenpijp, leaving out 100%', () => {
    const k = kaartItems(dossier({ data: { kaart_annotaties: tweeDaken, 'dak.d1.verdeling': { r1: 62, r2: 38 } } }));
    expect(verdelingTekst(k.daken[0], k.labels)).toBe('A 62% · B 38%');
    expect(verdelingTekst(k.daken[1], k.labels)).toBe('B');
    expect(bronnenTekst(k.regenpijpen[1], k.labels)).toBe('D1 (38%), D2');
  });
});

describe('verdelingenTeWissen', () => {
  // 0.1 m per px; both dakdelen have a hand-set verdeling.
  const oud: Annotatie[] = [
    { id: 'd1', type: 'dak', p: vierkant(0, 0, 60) },
    { id: 'd2', type: 'dak', p: vierkant(200, 0, 60) },
    { id: 'r1', type: 'regenpijp', p: [[30, 30]] },
    { id: 'r2', type: 'regenpijp', p: [[230, 30]] },
    { id: 't1', type: 'tuin', p: vierkant(0, 100, 60) },
  ];
  const d = dossier({ fotos: [kaart(0.1)], data: { 'dak.d1.verdeling': { r1: 100 }, 'dak.d2.verdeling': { r2: 100 } } });
  const met = (id: string, p: [number, number][]) => oud.map((a) => (a.id === id ? { ...a, p } : a));

  it('clears a dakdeel that was moved or reshaped', () => {
    expect(verdelingenTeWissen(d, oud, met('d2', vierkant(210, 0, 60)))).toEqual(['d2']);
  });

  it('clears the dakdelen near a regenpijp at its old and its new spot', () => {
    expect(verdelingenTeWissen(d, oud, met('r1', [[35, 30]]))).toEqual(['d1']);
    expect(verdelingenTeWissen(d, oud, met('r1', [[230, 40]]))).toEqual(['d1', 'd2']);
    expect(verdelingenTeWissen(d, oud, [...oud, { id: 'r3', type: 'regenpijp', p: [[262, 30]] }])).toEqual(['d2']);
  });

  it('clears a dakdeel whose verdeling names a removed regenpijp', () => {
    expect(verdelingenTeWissen(d, oud, oud.filter((a) => a.id !== 'r2'))).toEqual(['d2']);
  });

  it('leaves alone a tuin edit and a dakdeel that follows the kaart anyway', () => {
    expect(verdelingenTeWissen(d, oud, met('t1', vierkant(0, 120, 60)))).toEqual([]);
    expect(verdelingenTeWissen(dossier({ fotos: [kaart(0.1)] }), oud, met('r1', [[35, 30]]))).toEqual([]);
  });
});

describe('waterberging', () => {
  const dakDeel = (id: string, m2: number | null): DakDeel => ({ id, label: id, m2, m2Berekend: true, verdeling: [], automatischeVerdeling: [], automatisch: true, verlopen: false, afstandM: new Map() });
  const daken = [dakDeel('d1', 42), dakDeel('d2', 8), dakDeel('d3', null)];

  it('takes each regenpijp’s share of its dakdelen at the normafvoer, with the sum shown', () => {
    expect(waterberging({ id: 'a', label: 'A', bronnen: [{ dak: 'd1', pct: 62 }, { dak: 'd2', pct: 100 }] }, daken)).toEqual({ liter: 681, uitleg: '62% × 42 m² + 8 m² = 34 m² × 20 mm = 681 liter' });
    expect(waterberging({ id: 'a', label: 'A', bronnen: [{ dak: 'd2', pct: 100 }] }, daken)).toEqual({ liter: 160, uitleg: '8 m² × 20 mm = 160 liter' });
  });

  it('gives nothing for a regenpijp without a dakdeel, or with a dakdeel of unknown m²', () => {
    expect(waterberging({ id: 'a', label: 'A', bronnen: [] }, daken)).toBeNull();
    expect(waterberging({ id: 'a', label: 'A', bronnen: [{ dak: 'd1', pct: 50 }, { dak: 'd3', pct: 100 }] }, daken)).toBeNull();
  });
});

describe('annotatiesSvg', () => {
  it('draws labels and the area of a scaled dak', () => {
    const svg = annotatiesSvg([{ id: 'd1', type: 'dak', p: vierkant(0, 0, 60) }], { schaal: 1, mPerPx: 0.1 });
    expect(svg).toContain('>D1</text>');
    expect(svg).toContain('>36 m²</text>');
    expect(svg).toContain('>6 m</text>');
  });

  it('draws a steen as a red polygon with its label, area and sides', () => {
    const svg = annotatiesSvg([{ id: 'x1', type: 'steen', p: vierkant(0, 0, 30) }], { schaal: 1, mPerPx: 0.1 });
    expect(svg).toContain('<polygon points="0,0 30,0 30,30 0,30" fill="#e5383b"');
    expect(svg).toContain('>S1</text>');
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

  it('lists a regenpijp that drains no dakdeel', () => {
    const d = dossier({ data: { kaart_annotaties: [{ id: 'r1', type: 'regenpijp', p: [[5, 5]] }] } });
    expect(ontbrekend(d, 'bezoek')).toContainEqual({ label: 'Regenpijp A: aan geen dak gekoppeld', anker: 'veld-regenpijp.r1.bronnen' });
  });

  it('never asks for a steen, but asks for the m² of a drawn one on an unscaled kaart', () => {
    const d = dossier({ fotos: [kaart(null)], data: { kaart_annotaties: [{ id: 't1', type: 'tuin', p: vierkant(0, 0, 10) }] } });
    expect(ontbrekend(d, 'bezoek').map((o) => o.label).filter((l) => /^S\d|steen/i.test(l))).toEqual([]);
    d.data.kaart_annotaties = [{ id: 'x1', type: 'steen', p: vierkant(0, 0, 10) }];
    expect(ontbrekend(d, 'bezoek')).toContainEqual({ label: 'S1: m²', anker: 'veld-steen.x1.m2' });
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
