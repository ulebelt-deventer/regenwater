import { describe, expect, it } from 'vitest';
import { annotatieLabels, annotatiesSvg, kaartItems, letter, oppervlakPx, waterberging } from './kaart.ts';
import { ontbrekend } from './velden.ts';
import { dossier } from './testhulp.ts';
import type { Annotatie, Foto } from './types.ts';

const vierkant = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const kaart = (m_per_px: number | null): Foto => ({ id: 'f1', slot: 'kaart', breedte: 1000, hoogte: 1000, m_per_px, annotaties: [], created_at: '2026-03-01T00:00:00.000Z' });

describe('labels', () => {
  it('numbers daken and tuinen and letters regenpijpen and pijlen by order', () => {
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

  it('continues past Z with AA', () => {
    expect([letter(0), letter(25), letter(26)]).toEqual(['A', 'Z', 'AA']);
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

  it('escapes free text', () => {
    expect(annotatiesSvg([{ id: 't', type: 'tekst', p: [[1, 1]], tekst: '<b>' }], { schaal: 1, mPerPx: null })).toContain('&lt;b&gt;');
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
