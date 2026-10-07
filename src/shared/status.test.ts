import { describe, expect, it } from 'vitest';
import { STAPPEN, huidigeStap, intakeOntbreekt, opdracht, status } from './status.ts';
import { dossier, naIntake, verzending } from './testhulp.ts';

const T = '2026-03-05T10:00:00.000Z';

describe('huidigeStap', () => {
  it('starts a new dossier at Intake', () => {
    expect(huidigeStap(dossier()).key).toBe('intake');
  });

  it('stays at Intake until the subsidiemail is sent, even with all fields filled', () => {
    const d = naIntake('huur', { verzendingen: [] });
    expect(intakeOntbreekt(d)).toEqual(['subsidiemail']);
    expect(huidigeStap(d).key).toBe('intake');
  });

  it('needs both naam and e-mail of the bewoner to finish Intake', () => {
    const d = naIntake('koop');
    d.data.bewoner_email = '';
    expect(intakeOntbreekt(d)).toEqual(['e-mail bewoner']);
  });

  it('does not count a failed subsidiemail as sent', () => {
    const d = naIntake('koop', { verzendingen: [verzending('subsidie_koop', T, { mislukt_at: T })] });
    expect(huidigeStap(d).key).toBe('intake');
  });

  it('walks the huur path through every step to closed as Uitgevoerd', () => {
    const d = naIntake('huur');
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
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-10T14:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T });
    d.verzendingen.push(verzending('plan_bewoner_koop', T));
    expect(status(d)).toMatchObject({ label: 'Klussendienst of zelf? (koop)', ligtBij: 'bewoner' });
    d.klussendienst_gekozen_at = T;
    expect(huidigeStap(d).key).toBe('uitvoerder');
  });

  it('labels a closed dossier with its reden instead of a step', () => {
    const d = naIntake('koop', { gesloten_at: T, gesloten_reden: 'Bewoner afgehaakt' });
    expect(status(d).label).toBe('Gesloten: Bewoner afgehaakt');
  });

  it('numbers the steps 1 to 11 in order', () => {
    expect(STAPPEN.map((s) => s.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('opdracht', () => {
  const basis = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-10T14:00' });

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
