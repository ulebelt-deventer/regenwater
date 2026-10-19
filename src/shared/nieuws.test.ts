import { describe, expect, it } from 'vitest';
import { NIEUWS, nieuwsOngezien } from './nieuws.ts';

describe('NIEUWS', () => {
  it('has valid dates, strictly newest first, and no empty groups', () => {
    const data = NIEUWS.map((n) => n.datum);
    for (const d of data) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data).toEqual([...new Set(data)].sort().reverse());
    for (const n of NIEUWS) {
      expect(n.groepen.length, n.datum).toBeGreaterThan(0);
      for (const g of n.groepen) expect(g.punten.length, `${n.datum} ${g.kop}`).toBeGreaterThan(0);
    }
  });

  it('counts as unseen until the newest datum has been seen', () => {
    expect(nieuwsOngezien(null)).toBe(true);
    expect(nieuwsOngezien('2000-01-01')).toBe(true);
    expect(nieuwsOngezien(NIEUWS[0].datum)).toBe(false);
  });
});
