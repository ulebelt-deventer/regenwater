import { describe, expect, it } from 'vitest';
import { aandacht, klusserHerinnering, kloptNiet, ligtStil, planGewijzigd } from './aandacht.ts';
import { dossier, gebruiker, naIntake, verzending } from './testhulp.ts';
import type { Gebruiker } from './types.ts';

const nu = new Date('2026-03-20T12:00:00.000Z');
const geen = new Map<number, Gebruiker>();
const T = '2026-03-05T10:00:00.000Z';

describe('kloptNiet', () => {
  it('finds nothing on a fresh dossier', () => {
    expect(kloptNiet(dossier(), geen, nu)).toEqual([]);
  });

  it('flags a later milestone recorded before an earlier applicable one', () => {
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, bezoek_afgerond_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual([
      'Bezoek afgerond is geregistreerd, maar de afspraak niet. Registreer dat alsnog, of controleer of bezoek afgerond klopt.',
    ]);
  });

  it('does not flag earlier steps when a dossier is closed as Toch uitgevoerd', () => {
    const d = naIntake('koop', { gesloten_at: T, gesloten_reden: 'Uitgevoerd' });
    expect(kloptNiet(d, geen, nu)).toEqual([]);
  });

  it('flags a koopwoning with a corporatie approval, as after switching huur to koop', () => {
    const d = naIntake('koop', { corporatie_akkoord_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toContain('Dit is een koopwoning, maar er is een goedkeuring van de woningcorporatie geregistreerd. Klopt huur/koop?');
  });

  it('flags a huurwoning with a Klussendienst choice', () => {
    const d = naIntake('huur', { klussendienst_gekozen_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toContain('Dit is een huurwoning, maar er is een keuze van de bewoner (Klussendienst of zelf) geregistreerd. Klopt huur/koop?');
  });

  it('flags a gescheiden riool on an open dossier past Intake, but not during Intake', () => {
    const d = naIntake('koop');
    d.data.rioolstelsel = 'gescheiden';
    expect(kloptNiet(d, geen, nu)).toHaveLength(1);
    d.verzendingen = [];
    expect(kloptNiet(d, geen, nu)).toHaveLength(0);
  });

  it('flags a dossier closed as Niet subsidiabel while the riool is gemengd, even though closed', () => {
    const d = naIntake('koop', { gesloten_at: T, gesloten_reden: 'Niet subsidiabel' });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual(['Gesloten als niet subsidiabel, maar het rioolstelsel staat op gemengd.']);
  });

  it('flags a bezoek afgerond while the afspraak is in the future', () => {
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-04-01T10:00', bezoek_afgerond_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual(['Het bezoek is afgerond, maar de afspraak staat op 1 april 2026, in de toekomst. Klopt de afspraakdatum?']);
  });

  it('flags an archived bezoeker only while the bezoek steps are open', () => {
    const g = new Map([[2, gebruiker(2, { naam: 'Henk', archived_at: T })]]);
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T });
    expect(kloptNiet(d, g, nu).map((b) => b.tekst)).toEqual(['Henk is gearchiveerd, maar is nog bezoeker van dit dossier. Wijs iemand anders toe.']);
    expect(kloptNiet({ ...d, afspraak: '2026-03-10T10:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T }, g, nu)).toEqual([]);
  });
});

describe('ligtStil', () => {
  it('flags an Intake open for more than 3 days, listing what is missing', () => {
    const d = dossier({ created_at: '2026-03-16T09:00:00.000Z' });
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Intake staat al 4 dagen open. Nog nodig: adres, naam bewoner, e-mail bewoner, huur/koop, rioolstelsel, subsidiemail.');
    expect(ligtStil(dossier({ created_at: '2026-03-17T13:00:00.000Z' }), geen, nu)).toBeNull();
  });

  it('runs the Bezoeker toewijzen clock from the first subsidiemail, not a re-mail', () => {
    const d = naIntake('koop');
    d.verzendingen.push(verzending('subsidie_koop', '2026-03-19T09:00:00.000Z'));
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Al 18 dagen geen bezoeker. Zet eventueel een (nieuwe) oproep in de Signal-groep.');
  });

  it('raises no flag for an afspraak in the future, and does 3 days past', () => {
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-25T10:00' });
    expect(ligtStil(d, geen, nu)).toBeNull();
    d.afspraak = '2026-03-17T10:00';
    expect(ligtStil(d, geen, nu)?.tekst).toBe('De afspraak was op 17 maart 2026, 3 dagen geleden, maar het bezoek is nog niet afgerond. Is het doorgegaan?');
  });

  it('runs step 10 from the planned date when set, else from the assignment', () => {
    const d = naIntake('koop', {
      bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-06T10:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T,
      klussendienst_gekozen_at: T, uitvoerder_id: 3, uitvoerder_toegewezen_at: '2026-02-20T10:00:00.000Z',
    });
    d.verzendingen.push(verzending('plan_bewoner_koop', T));
    const g = new Map([[3, gebruiker(3, { naam: 'Piet' })]]);
    expect(ligtStil(d, g, nu)?.tekst).toBe('Piet is 28 dagen geleden toegewezen, maar er is nog geen uitvoering gepland of opgeleverd.');
    d.uitvoering_gepland = '2026-03-25';
    expect(ligtStil(d, g, nu)).toBeNull();
    d.uitvoering_gepland = '2026-03-16';
    expect(ligtStil(d, g, nu)?.tekst).toBe('De uitvoering stond gepland op 16 maart 2026, maar is nog niet opgeleverd.');
  });

  it('marks a finding as snoozed until its date, which no longer counts as aandacht', () => {
    const d = dossier({ created_at: '2026-03-01T09:00:00.000Z' });
    d.uitstellen.push({ id: 1, stap: 'intake', tot: '2026-03-25', notitie: 'Bewoner op vakantie', created_at: T, created_by: 1 });
    expect(ligtStil(d, geen, nu)?.uitgesteld).toEqual({ tot: '2026-03-25', notitie: 'Bewoner op vakantie' });
    expect(aandacht(d, geen, nu).nodig).toBe(false);
    expect(aandacht(d, geen, new Date('2026-03-25T08:00:00.000Z')).nodig).toBe(true);
  });

  it('ignores a snooze for another step', () => {
    const d = dossier({ created_at: '2026-03-01T09:00:00.000Z' });
    d.uitstellen.push({ id: 1, stap: 'bezoeker', tot: '2026-03-25', notitie: 'x', created_at: T, created_by: 1 });
    expect(aandacht(d, geen, nu).nodig).toBe(true);
  });

  it('never flags a closed dossier', () => {
    expect(ligtStil(dossier({ gesloten_at: T, gesloten_reden: 'Anders' }), geen, nu)).toBeNull();
  });
});

describe('planGewijzigd', () => {
  const basis = () => naIntake('huur', { verzendingen: [verzending('subsidie_huur', T), verzending('plan_corporatie', '2026-03-10T10:00:00.000Z')] });

  it('flags a plan changed after the send to the corporatie', () => {
    const d = { ...basis(), plan_gewijzigd_at: '2026-03-11T10:00:00.000Z' };
    expect(planGewijzigd(d).map((b) => b.tekst)).toEqual([
      'Het plan is gewijzigd op 11 maart 2026, na het versturen naar de woningcorporatie op 10 maart 2026. Stuur het opnieuw, of markeer dat dat niet nodig is.',
    ]);
  });

  it('clears when resent', () => {
    const d = { ...basis(), plan_gewijzigd_at: '2026-03-11T10:00:00.000Z' };
    d.verzendingen.push(verzending('plan_corporatie', '2026-03-12T10:00:00.000Z'));
    expect(planGewijzigd(d)).toEqual([]);
  });

  it('clears with "Opnieuw versturen niet nodig" until a later change', () => {
    const d = { ...basis(), plan_gewijzigd_at: '2026-03-11T10:00:00.000Z' };
    d.plan_acks.push({ id: 1, ontvanger: 'corporatie', notitie: 'alleen typfout', created_at: '2026-03-12T10:00:00.000Z', created_by: 1 });
    expect(planGewijzigd(d)).toEqual([]);
    d.plan_gewijzigd_at = '2026-03-13T10:00:00.000Z';
    expect(planGewijzigd(d)).toHaveLength(1);
  });
});

describe('klusserHerinnering', () => {
  it('shows a klusser the Ligt stil finding for their own step only', () => {
    const d = naIntake('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: '2026-03-01T10:00:00.000Z' });
    expect(klusserHerinnering(d, 2, geen, nu)?.stap).toBe('afspraak');
    expect(klusserHerinnering(d, 3, geen, nu)).toBeNull();
  });
});
