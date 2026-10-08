import { describe, expect, it } from 'vitest';
import { dossier } from './testhulp.ts';
import { veldTekst } from './velden.ts';

describe('veldTekst', () => {
  const d = dossier({
    huur_koop: 'huur',
    afspraak: '2026-03-05T14:30:00.000Z',
    data: {
      woningtype: 'anders',
      woningtype_anders: 'Woonboot',
      'regenpijp.a1.hoe': ['holie_molie', 'ondergronds'],
      verhard: 37.5,
      wensen: '  Een regenton\nbij de schuur  ',
      boorlocatie: '',
    },
  });

  it('gives option labels, the write-in for Anders, and joined labels for checks', () => {
    expect(veldTekst(d, 'huur_koop')).toBe('Huurwoning');
    expect(veldTekst(d, 'woningtype')).toBe('Woonboot');
    expect(veldTekst(d, 'regenpijp.a1.hoe')).toBe('Holie Molie, Ondergronds');
  });

  it('formats numbers Dutch-style with a % for verhard, and trims text but keeps its line breaks', () => {
    expect(veldTekst(d, 'verhard')).toBe('37,5%');
    expect(veldTekst(d, 'wensen')).toBe('Een regenton\nbij de schuur');
  });

  it('formats the afspraak as date and time', () => {
    expect(veldTekst(d, 'afspraak')).toMatch(/2026.*\d{2}:\d{2}/);
  });

  it('is null for an empty or missing value', () => {
    expect(veldTekst(d, 'boorlocatie')).toBeNull();
    expect(veldTekst(d, 'tuinsituatie')).toBeNull();
  });

  it('throws for unknown fields and for fields without a single text value', () => {
    expect(() => veldTekst(d, 'bestaat_niet')).toThrow('Onbekend veld');
    expect(() => veldTekst(dossier({ data: { 'regenpijp.a1.dak': 'd1' } }), 'regenpijp.a1.dak')).toThrow('geen losse tekstwaarde');
  });
});
