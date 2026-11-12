import { describe, expect, it } from 'vitest';
import { LIGT_BIJ_LABEL, STAPPEN, huidigeStap, inschrijvingOntbreekt, opdracht, sectieOpen, status } from './status.ts';
import { dossier, naInschrijving, verzending } from './testhulp.ts';

const T = '2026-03-05T10:00:00.000Z';

describe('huidigeStap', () => {
  it('starts a new dossier at Inschrijving', () => {
    expect(huidigeStap(dossier()).key).toBe('inschrijving');
  });

  it('stays at Inschrijving until an admin marks it complete, even with nothing missing', () => {
    const d = naInschrijving('huur', { inschrijving_afgerond_at: null });
    expect(inschrijvingOntbreekt(d)).toEqual([]);
    expect(huidigeStap(d).key).toBe('inschrijving');
  });

  it('leaves Inschrijving once marked complete, even with fields missing', () => {
    const d = dossier({ inschrijving_afgerond_at: T });
    expect(inschrijvingOntbreekt(d)).toContain('subsidiemail');
    expect(huidigeStap(d).key).toBe('bezoeker');
  });

  it('lists the subsidiemail as missing until it is sent', () => {
    expect(inschrijvingOntbreekt(naInschrijving('huur', { verzendingen: [] }))).toEqual(['subsidiemail']);
  });

  it('needs both naam and e-mail of the bewoner to finish Inschrijving', () => {
    const d = naInschrijving('koop');
    d.data.bewoner_email = '';
    expect(inschrijvingOntbreekt(d)).toEqual(['e-mail bewoner']);
  });

  it('does not count a failed subsidiemail as sent', () => {
    const d = naInschrijving('koop', { verzendingen: [verzending('subsidie_koop', T, { mislukt_at: T })] });
    expect(inschrijvingOntbreekt(d)).toEqual(['subsidiemail']);
  });

  it('walks the huur path through every step to closed as Uitgevoerd', () => {
    const d = naInschrijving('huur');
    expect(huidigeStap(d).key).toBe('bezoeker');
    Object.assign(d, { bezoeker_id: 2, bezoeker_toegewezen_at: T });
    expect(huidigeStap(d).key).toBe('afspraak');
    d.afspraak = '2026-03-10T14:00';
    expect(huidigeStap(d).key).toBe('bezoek');
    d.bezoek_afgerond_at = T;
    expect(huidigeStap(d).key).toBe('plan');
    d.klaar_voor_controle_at = T;
    expect(huidigeStap(d).key).toBe('versturen');
    d.verzendingen.push(verzending('plan_bewoner_huur', T));
    expect(huidigeStap(d).key).toBe('versturen');
    d.verzendingen.push(verzending('plan_corporatie', T));
    expect(huidigeStap(d).key).toBe('akkoord_huur');
    d.corporatie_akkoord_at = T;
    expect(huidigeStap(d).key).toBe('uitvoerder');
    Object.assign(d, { uitvoerder_id: 2, uitvoerder_toegewezen_at: T });
    expect(huidigeStap(d).key).toBe('uitvoering');
    d.werk_opgeleverd_at = T;
    expect(huidigeStap(d).key).toBe('oplevering');
    Object.assign(d, { gesloten_at: T, gesloten_reden: 'Uitgevoerd' });
    expect(status(d)).toMatchObject({ gesloten: true, label: 'Gesloten: Uitgevoerd', ligtBij: null });
  });

  it('skips the corporatie step for a koopwoning and waits for the bewoner instead', () => {
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-10T14:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T });
    d.verzendingen.push(verzending('plan_bewoner_koop', T));
    expect(status(d)).toMatchObject({ label: 'Klussendienst of zelf? (koop)', ligtBij: 'bewoner' });
    d.klussendienst_gekozen_at = T;
    expect(huidigeStap(d).key).toBe('uitvoerder');
  });

  it('counts the plan as sent once the eigenaar decision is registered, even without a plan email', () => {
    const klaar = { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-10T14:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T };
    expect(huidigeStap(naInschrijving('huur', { ...klaar, corporatie_akkoord_at: T })).key).toBe('uitvoerder');
    expect(huidigeStap(naInschrijving('koop', { ...klaar, klussendienst_gekozen_at: T })).key).toBe('uitvoerder');
    expect(huidigeStap(naInschrijving('huur', { ...klaar, gesloten_at: T, gesloten_reden: 'Plan afgewezen' })).key).toBe('akkoord_huur');
    expect(huidigeStap(naInschrijving('koop', { ...klaar, gesloten_at: T, gesloten_reden: 'Bewoner doet het zelf' })).key).toBe('keuze_koop');
    expect(huidigeStap(naInschrijving('huur', { ...klaar, gesloten_at: T, gesloten_reden: 'Bewoner afgehaakt' })).key).toBe('versturen');
  });

  it('labels a closed dossier with its reden instead of a step', () => {
    const d = naInschrijving('koop', { gesloten_at: T, gesloten_reden: 'Bewoner afgehaakt' });
    expect(status(d).label).toBe('Gesloten: Bewoner afgehaakt');
  });

  it('numbers the steps 1 to 11 in order', () => {
    expect(STAPPEN.map((s) => s.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('opdracht', () => {
  const basis = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-10T14:00' });

  it('gives the bezoeker a current Bezoek during steps 3-5', () => {
    expect(opdracht(basis, 2)).toEqual({ rol: 'Bezoek', aanZet: true, klaar: false });
  });

  it('shows a done Bezoek once the plan is with the admins', () => {
    const d = { ...basis, bezoek_afgerond_at: T, klaar_voor_controle_at: T };
    expect(opdracht(d, 2)).toEqual({ rol: 'Bezoek', aanZet: false, klaar: true });
  });

  it('switches someone who is both bezoeker and uitvoerder to Uitvoering at step 10', () => {
    const d = { ...basis, bezoek_afgerond_at: T, klaar_voor_controle_at: T, klussendienst_gekozen_at: T, uitvoerder_id: 2, uitvoerder_toegewezen_at: T, verzendingen: [...basis.verzendingen, verzending('plan_bewoner_koop', T)] };
    expect(opdracht(d, 2)).toEqual({ rol: 'Uitvoering', aanZet: true, klaar: false });
  });

  it('returns nothing for someone not on the dossier', () => {
    expect(opdracht(basis, 9)).toBeNull();
  });
});

describe('sectieOpen', () => {
  const open = (d: Parameters<typeof sectieOpen>[0]) =>
    ['sectie-bezoeker', 'sectie-bezoek', 'sectie-plan', 'sectie-versturen', 'sectie-uitvoerder', 'sectie-uitvoering', 'sectie-oplevering'].filter((s) => sectieOpen(d, s));
  const klaar = naInschrijving('huur', { bezoeker_id: 2, bezoek_afgerond_at: T, klaar_voor_controle_at: T, corporatie_akkoord_at: T, uitvoerder_id: 3, werk_opgeleverd_at: T });

  it('keeps every section after Inschrijving closed until it is marked complete', () => {
    expect(open(naInschrijving('huur', { inschrijving_afgerond_at: null }))).toEqual([]);
  });

  it('opens one section per ticked milestone, in order', () => {
    expect(open(naInschrijving('huur'))).toEqual(['sectie-bezoeker']);
    expect(open(naInschrijving('huur', { bezoeker_id: 2 }))).toEqual(['sectie-bezoeker', 'sectie-bezoek']);
    expect(open(naInschrijving('huur', { bezoeker_id: 2, bezoek_afgerond_at: T, klaar_voor_controle_at: T }))).toEqual(['sectie-bezoeker', 'sectie-bezoek', 'sectie-plan', 'sectie-versturen']);
    expect(open(klaar)).toHaveLength(7);
  });

  it('keeps later sections closed when an earlier milestone is missing, even if later ones are ticked', () => {
    expect(open({ ...klaar, bezoek_afgerond_at: null })).toEqual(['sectie-bezoeker', 'sectie-bezoek']);
  });

  it('opens Uitvoerder on the akkoord for huur and on the Klussendienst choice for koop', () => {
    expect(sectieOpen({ ...klaar, corporatie_akkoord_at: null, klussendienst_gekozen_at: T }, 'sectie-uitvoerder')).toBe(false);
    expect(sectieOpen({ ...klaar, huur_koop: 'koop', corporatie_akkoord_at: null, klussendienst_gekozen_at: T }, 'sectie-uitvoerder')).toBe(true);
    expect(sectieOpen({ ...klaar, huur_koop: 'koop' }, 'sectie-uitvoerder')).toBe(false);
  });

  it('throws on a section it does not know', () => {
    expect(() => sectieOpen(klaar, 'sectie-status')).toThrow('Onbekende sectie');
  });
});

describe('ligt bij', () => {
  it('puts the bezoek steps with the bezoeker and Werk uitvoeren with the uitvoerder, never with a klusser in general', () => {
    const bij = Object.fromEntries(STAPPEN.map((s) => [s.key, s.ligtBij]));
    expect(bij).toMatchObject({ afspraak: 'bezoeker', bezoek: 'bezoeker', plan: 'bezoeker', uitvoering: 'uitvoerder' });
    expect(Object.values(LIGT_BIJ_LABEL)).toEqual(['Beheerder', 'Bezoeker', 'Uitvoerder', 'Woningcorporatie', 'Bewoner']);
  });
});
