import { describe, expect, it } from 'vitest';
import { actieveRollen, magBewerken, magMijlpaal, magZien } from './rechten.ts';
import { dossier, gebruiker } from './testhulp.ts';

const BEA = gebruiker(1, { rol: 'beheerder' });
const KEES = gebruiker(7);
const RIA = gebruiker(8);
const ANDER = gebruiker(9);
const AT = '2026-03-10T09:00:00.000Z';

describe('magZien', () => {
  it('shows a dossier to admins and to its bezoeker and uitvoerder only', () => {
    const d = dossier({ bezoeker_id: 7, uitvoerder_id: 8 });
    expect([BEA, KEES, RIA, ANDER].map((g) => magZien(g, d))).toEqual([true, true, true, false]);
  });

  it('keeps showing it after the klusser’s part is done or the dossier is closed', () => {
    const d = dossier({ bezoeker_id: 7, klaar_voor_controle_at: AT, gesloten_at: AT });
    expect(magZien(KEES, d)).toBe(true);
  });
});

describe('actieveRollen', () => {
  it('ends the bezoeker role at Klaar voor controle and the uitvoerder role at Werk opgeleverd', () => {
    expect(actieveRollen(KEES, dossier({ bezoeker_id: 7 }))).toEqual(['bezoeker']);
    expect(actieveRollen(KEES, dossier({ bezoeker_id: 7, klaar_voor_controle_at: AT }))).toEqual([]);
    expect(actieveRollen(RIA, dossier({ uitvoerder_id: 8, klaar_voor_controle_at: AT }))).toEqual(['uitvoerder']);
    expect(actieveRollen(RIA, dossier({ uitvoerder_id: 8, werk_opgeleverd_at: AT }))).toEqual([]);
  });

  it('gives one person both roles when they are bezoeker and uitvoerder, each ending on its own', () => {
    expect(actieveRollen(KEES, dossier({ bezoeker_id: 7, uitvoerder_id: 7 }))).toEqual(['bezoeker', 'uitvoerder']);
    expect(actieveRollen(KEES, dossier({ bezoeker_id: 7, uitvoerder_id: 7, klaar_voor_controle_at: AT }))).toEqual(['uitvoerder']);
  });

  it('gives an admin no klusser role of their own', () => {
    expect(actieveRollen(BEA, dossier())).toEqual([]);
  });
});

describe('magBewerken', () => {
  const d = dossier({ bezoeker_id: 7, uitvoerder_id: 8 });

  it('lets an admin edit every field, even one no klusser may touch', () => {
    expect([magBewerken(BEA, d, []), magBewerken(BEA, d, ['bezoeker'])]).toEqual([true, true]);
  });

  it('lets a klusser edit only fields of a role they still hold', () => {
    expect(magBewerken(KEES, d, ['bezoeker'])).toBe(true);
    expect(magBewerken(KEES, d, ['uitvoerder'])).toBe(false);
    expect(magBewerken(KEES, d, [])).toBe(false);
    expect(magBewerken(RIA, d, ['bezoeker', 'uitvoerder'])).toBe(true);
    expect(magBewerken(ANDER, d, ['bezoeker', 'uitvoerder'])).toBe(false);
  });

  it('makes a closed dossier read-only for everyone, admins included', () => {
    const dicht = dossier({ bezoeker_id: 7, gesloten_at: AT });
    expect([magBewerken(BEA, dicht, []), magBewerken(KEES, dicht, ['bezoeker'])]).toEqual([false, false]);
  });
});

describe('magMijlpaal', () => {
  const d = dossier({ bezoeker_id: 7, uitvoerder_id: 8 });

  it('lets each klusser tap only their own hand-off milestones', () => {
    expect([magMijlpaal(KEES, d, 'bezoek_afgerond'), magMijlpaal(KEES, d, 'klaar_voor_controle'), magMijlpaal(KEES, d, 'werk_opgeleverd')]).toEqual([true, true, false]);
    expect([magMijlpaal(RIA, d, 'werk_opgeleverd'), magMijlpaal(RIA, d, 'klaar_voor_controle')]).toEqual([true, false]);
  });

  it('keeps the admin milestones for admins', () => {
    for (const m of ['corporatie_akkoord', 'klussendienst_gekozen'] as const) expect([magMijlpaal(BEA, d, m), magMijlpaal(KEES, d, m), magMijlpaal(RIA, d, m)]).toEqual([true, false, false]);
  });

  it('stops the bezoeker tapping Bezoek afgerond once Klaar voor controle is set', () => {
    expect(magMijlpaal(KEES, dossier({ bezoeker_id: 7, klaar_voor_controle_at: AT }), 'bezoek_afgerond')).toBe(false);
  });
});
