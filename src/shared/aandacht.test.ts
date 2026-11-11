import { describe, expect, it } from 'vitest';
import { aandacht, klusserHerinnering, kloptNiet, ligtStil, planGewijzigd } from './aandacht.ts';
import { dossier, gebruiker, naInschrijving, verzending } from './testhulp.ts';
import type { Gebruiker } from './types.ts';

const nu = new Date('2026-03-20T12:00:00.000Z');
const geen = new Map<number, Gebruiker>();
const T = '2026-03-05T10:00:00.000Z';

describe('kloptNiet', () => {
  it('finds nothing on a fresh dossier', () => {
    expect(kloptNiet(dossier(), geen, nu)).toEqual([]);
  });

  it('flags a later milestone recorded before an earlier applicable one', () => {
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, bezoek_afgerond_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual([
      'Stap 4 (Bezoek uitvoeren) is gedaan, maar stap 3 (Bezoek plannen) nog niet.',
    ]);
  });

  it('does not flag earlier steps when a dossier is closed as Toch uitgevoerd', () => {
    const d = naInschrijving('koop', { gesloten_at: T, gesloten_reden: 'Uitgevoerd' });
    expect(kloptNiet(d, geen, nu)).toEqual([]);
  });

  it('flags a koopwoning with a corporatie approval, as after switching huur to koop', () => {
    const d = naInschrijving('koop', { corporatie_akkoord_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toContain('Koopwoning, maar met goedkeuring van de woningcorporatie. Klopt huur/koop?');
  });

  it('flags a huurwoning with a Klussendienst choice', () => {
    const d = naInschrijving('huur', { klussendienst_gekozen_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toContain('Huurwoning, maar met een keuze voor Klussendienst of zelf. Klopt huur/koop?');
  });

  it('flags a gescheiden riool on an open dossier past Inschrijving, but not during Inschrijving', () => {
    const d = naInschrijving('koop');
    d.data.rioolstelsel = 'gescheiden';
    expect(kloptNiet(d, geen, nu)).toHaveLength(1);
    d.inschrijving_afgerond_at = null;
    expect(kloptNiet(d, geen, nu)).toHaveLength(0);
  });

  it('flags a dossier closed as Niet subsidiabel while the riool is gemengd, even though closed', () => {
    const d = naInschrijving('koop', { gesloten_at: T, gesloten_reden: 'Niet subsidiabel' });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual(['Gesloten als niet subsidiabel, maar het riool is gemengd.']);
  });

  it('flags a bezoek afgerond while the afspraak is in the future', () => {
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-04-01T10:00', bezoek_afgerond_at: T });
    expect(kloptNiet(d, geen, nu).map((b) => b.tekst)).toEqual(['Bezoek afgerond, maar de afspraak is pas op 1 april 2026.']);
  });

  it('flags an archived bezoeker only while the bezoek steps are open', () => {
    const g = new Map([[2, gebruiker(2, { naam: 'Henk', archived_at: T })]]);
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T });
    expect(kloptNiet(d, g, nu).map((b) => b.tekst)).toEqual(['Henk is gearchiveerd, maar nog bezoeker. Wijs iemand anders toe.']);
    expect(kloptNiet({ ...d, afspraak: '2026-03-10T10:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T }, g, nu)).toEqual([]);
  });
});

describe('ligtStil', () => {
  it('flags an Inschrijving open for more than 3 days, listing what is missing', () => {
    const d = dossier({ created_at: '2026-03-16T09:00:00.000Z' });
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Inschrijving al 4 dagen open. Nog niet ingevuld: adres, naam bewoner, e-mail bewoner, huur/koop, rioolstelsel, subsidiemail.');
    expect(ligtStil(dossier({ created_at: '2026-03-17T13:00:00.000Z' }), geen, nu)).toBeNull();
  });

  it('says an Inschrijving with nothing missing is still waiting to be marked complete', () => {
    const d = naInschrijving('koop', { inschrijving_afgerond_at: null, inschrijving_afgerond_by: null });
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Inschrijving al 19 dagen open. Nog niet als compleet gemarkeerd.');
  });

  it('runs the Bezoeker toewijzen clock from when the inschrijving was marked complete, not from a later subsidiemail', () => {
    const d = naInschrijving('koop', { inschrijving_afgerond_at: '2026-03-10T09:00:00.000Z' });
    d.verzendingen.push(verzending('subsidie_koop', '2026-03-19T09:00:00.000Z'));
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Al 10 dagen geen bezoeker. Nieuwe oproep in de Signal-groep?');
  });

  it('raises no flag for an afspraak in the future, and does 3 days past', () => {
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-25T10:00' });
    expect(ligtStil(d, geen, nu)).toBeNull();
    d.afspraak = '2026-03-17T10:00';
    expect(ligtStil(d, geen, nu)?.tekst).toBe('Afspraak was op 17 maart 2026, maar het bezoek is niet afgerond. Doorgegaan?');
  });

  it('runs step 10 from the planned date when set, else from the assignment', () => {
    const d = naInschrijving('koop', {
      bezoeker_id: 2, bezoeker_toegewezen_at: T, afspraak: '2026-03-06T10:00', bezoek_afgerond_at: T, klaar_voor_controle_at: T,
      klussendienst_gekozen_at: T, uitvoerder_id: 3, uitvoerder_toegewezen_at: '2026-02-20T10:00:00.000Z',
    });
    d.verzendingen.push(verzending('plan_bewoner_koop', T));
    const g = new Map([[3, gebruiker(3, { naam: 'Piet' })]]);
    expect(ligtStil(d, g, nu)?.tekst).toBe('Piet heeft na 28 dagen nog geen uitvoering gepland.');
    d.uitvoering_gepland = '2026-03-25';
    expect(ligtStil(d, g, nu)).toBeNull();
    d.uitvoering_gepland = '2026-03-16';
    expect(ligtStil(d, g, nu)?.tekst).toBe('Uitvoering was gepland op 16 maart 2026, maar niet opgeleverd.');
  });

  it('marks a finding as snoozed until its date, which no longer counts as aandacht', () => {
    const d = dossier({ created_at: '2026-03-01T09:00:00.000Z' });
    d.uitstellen.push({ id: 1, stap: 'inschrijving', tot: '2026-03-25', notitie: 'Bewoner op vakantie', created_at: T, created_by: 1 });
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
  const basis = () => naInschrijving('huur', { verzendingen: [verzending('subsidie_huur', T), verzending('plan_corporatie', '2026-03-10T10:00:00.000Z')] });

  it('flags a plan changed after the send to the corporatie', () => {
    const d = { ...basis(), plan_gewijzigd_at: '2026-03-11T10:00:00.000Z' };
    expect(planGewijzigd(d).map((b) => b.tekst)).toEqual([
      'Plan gewijzigd op 11 maart 2026, na versturen naar de woningcorporatie. Opnieuw sturen?',
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
    const d = naInschrijving('koop', { bezoeker_id: 2, bezoeker_toegewezen_at: '2026-03-01T10:00:00.000Z' });
    expect(klusserHerinnering(d, 2, geen, nu)?.stap).toBe('afspraak');
    expect(klusserHerinnering(d, 3, geen, nu)).toBeNull();
  });
});

describe('verborgen meldingen', () => {
  it('leaves out a hidden Klopt niet finding and keeps the others', () => {
    const d = naInschrijving('koop', { corporatie_akkoord_at: T, bezoek_afgerond_at: T, afspraak: '2026-04-01T10:00' });
    expect(kloptNiet(d, geen, nu).map((b) => b.sleutel)).toContain('koop_met_akkoord');
    d.verborgen = ['koop_met_akkoord'];
    const sleutels = kloptNiet(d, geen, nu).map((b) => b.sleutel);
    expect(sleutels).not.toContain('koop_met_akkoord');
    expect(sleutels).toContain('bezoek_voor_afspraak');
  });

  it('keeps a finding hidden when a date in its text changes', () => {
    const d = naInschrijving('koop', { bezoek_afgerond_at: T, afspraak: '2026-04-01T10:00', verborgen: ['bezoek_voor_afspraak'] });
    expect(kloptNiet(d, geen, nu).map((b) => b.sleutel)).not.toContain('bezoek_voor_afspraak');
    d.afspraak = '2026-05-01T10:00';
    expect(kloptNiet(d, geen, nu).map((b) => b.sleutel)).not.toContain('bezoek_voor_afspraak');
  });

  it('hides Ligt stil only for the step it was hidden at, and out of the Aandacht count', () => {
    const d = dossier({ created_at: '2026-03-16T09:00:00.000Z', verborgen: ['ligt_stil:inschrijving'] });
    expect(ligtStil(d, geen, nu)).toBeNull();
    expect(aandacht(d, geen, nu).nodig).toBe(false);
    const volgende = naInschrijving('koop', { inschrijving_afgerond_at: '2026-03-10T09:00:00.000Z', verborgen: ['ligt_stil:inschrijving'] });
    expect(ligtStil(volgende, geen, nu)?.sleutel).toBe('ligt_stil:bezoeker');
  });
});
