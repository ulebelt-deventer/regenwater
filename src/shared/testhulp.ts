// Builders for unit tests of the shared rules.
import type { Dossier, Gebruiker, Verzending } from './types.ts';

export function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    id: 1,
    created_at: '2026-03-01T09:00:00.000Z',
    created_by: 1,
    adres: null,
    huur_koop: null,
    bezoeker_id: null,
    uitvoerder_id: null,
    afspraak: null,
    uitvoering_gepland: null,
    intake_afgerond_at: null,
    intake_afgerond_by: null,
    bezoeker_toegewezen_at: null,
    bezoeker_toegewezen_by: null,
    bezoek_afgerond_at: null,
    bezoek_afgerond_by: null,
    klaar_voor_controle_at: null,
    klaar_voor_controle_by: null,
    corporatie_akkoord_at: null,
    corporatie_akkoord_by: null,
    klussendienst_gekozen_at: null,
    klussendienst_gekozen_by: null,
    uitvoerder_toegewezen_at: null,
    uitvoerder_toegewezen_by: null,
    werk_opgeleverd_at: null,
    werk_opgeleverd_by: null,
    gesloten_at: null,
    gesloten_by: null,
    gesloten_reden: null,
    gesloten_toelichting: null,
    plan_gewijzigd_at: null,
    data: {},
    extra: {},
    verzendingen: [],
    uitstellen: [],
    plan_acks: [],
    fotos: [],
    laatste_activiteit_at: null,
    ...over,
  };
}

let volgnummer = 1;
export function verzending(sjabloon: string, created_at: string, over: Partial<Verzending> = {}): Verzending {
  return {
    id: volgnummer++,
    sjabloon,
    ontvanger: sjabloon.includes('corporatie') ? 'corporatie' : sjabloon.startsWith('uitvoerder') ? 'uitvoerder' : 'bewoner',
    aan: 'x@example.org',
    cc: null,
    onderwerp: 'Onderwerp',
    tekst: 'Tekst',
    handmatig: false,
    mislukt_at: null,
    created_at,
    created_by: 1,
    ...over,
  };
}

export const ADRES = {
  straat: 'Walstraat', huisnummer: 74, huisletter: '', toevoeging: '', postcode: '7411GK', plaats: 'Deventer', gemeente: 'Deventer',
  percelen: ['DVT00-E-11907'], rd: [207965.881, 474195.177] as [number, number], ll: [52.25324535, 6.1628876] as [number, number], perceel_bbox: null,
};

// A dossier with a complete intake, mailed and marked complete on 2 March.
export function naIntake(huur_koop: 'huur' | 'koop', over: Partial<Dossier> = {}): Dossier {
  return dossier({
    adres: ADRES,
    huur_koop,
    data: { bewoner_naam: 'Anna de Vries', bewoner_email: 'anna@example.org', rioolstelsel: 'gemengd', woningeigenaar: huur_koop === 'huur' ? 'Ieder1' : null },
    verzendingen: [verzending(huur_koop === 'huur' ? 'subsidie_huur' : 'subsidie_koop', '2026-03-02T09:00:00.000Z')],
    intake_afgerond_at: '2026-03-02T09:00:00.000Z',
    intake_afgerond_by: 1,
    ...over,
  });
}

export function gebruiker(id: number, over: Partial<Gebruiker> = {}): Gebruiker {
  return { id, naam: `Gebruiker ${id}`, email: `g${id}@example.org`, telefoon: null, rol: 'klusser', created_at: '2026-01-01T00:00:00.000Z', archived_at: null, last_active_at: null, ...over };
}
