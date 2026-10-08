import { datum, dagenSinds, lokaal, isoDatum } from './datum.ts';
import {
  STAPPEN, PLAN_SJABLONEN, afspraakDatum, corporatieNaam, huidigeStap, intakeOntbreekt,
  laatsteVerzending, str, type Stap,
} from './status.ts';
import type { Dossier, Gebruiker, Ontvanger } from './types.ts';

export type Soort = 'klopt_niet' | 'plan_gewijzigd' | 'ligt_stil';

export interface Bevinding {
  soort: Soort;
  tekst: string;
  anker: string;
  stap?: string;
  ontvanger?: Ontvanger;
  uitgesteld?: { tot: string; notitie: string };
}

export const KLOPT_NIET_KOP = 'De gegevens spreken elkaar tegen. Controleer:';

// Ligt stil thresholds in days, per step. Shown on the Aandacht-criteria page.
export const DREMPELS = {
  intake: 3,
  bezoeker: 7,
  afspraak: 7,
  bezoek: 2,
  plan: 5,
  versturen: 5,
  akkoord_huur: 14,
  keuze_koop: 14,
  uitvoerder: 7,
  uitvoering: 3,
  uitvoering_zonder_datum: 21,
  oplevering: 7,
} as const;

export interface LigtStilRegel {
  stap: string;
  wanneer: string;
  tekst: string;
}

export const LIGT_STIL_REGELS: LigtStilRegel[] = [
  { stap: 'intake', wanneer: `> ${DREMPELS.intake} dagen sinds aangemaakt`, tekst: 'Intake al {n} dagen open. Nog niet ingevuld: {ontbrekende velden}.' },
  { stap: 'bezoeker', wanneer: `> ${DREMPELS.bezoeker} dagen sinds de intake compleet is`, tekst: 'Al {n} dagen geen bezoeker. Nieuwe oproep in de Signal-groep?' },
  { stap: 'afspraak', wanneer: `> ${DREMPELS.afspraak} dagen sinds de bezoeker is toegewezen`, tekst: '{bezoeker} heeft na {n} dagen nog geen afspraak gepland.' },
  { stap: 'bezoek', wanneer: `> ${DREMPELS.bezoek} dagen na de afspraak; nooit zolang de afspraak in de toekomst ligt`, tekst: 'Afspraak was op {datum}, maar het bezoek is niet afgerond. Doorgegaan?' },
  { stap: 'plan', wanneer: `> ${DREMPELS.plan} dagen sinds bezoek afgerond`, tekst: 'Bezoek was {n} dagen geleden; plan nog niet klaar voor controle.' },
  { stap: 'versturen', wanneer: `> ${DREMPELS.versturen} dagen sinds klaar voor controle`, tekst: 'Plan wacht al {n} dagen op controle.' },
  { stap: 'akkoord_huur', wanneer: `> ${DREMPELS.akkoord_huur} dagen sinds het laatste versturen naar de woningcorporatie`, tekst: '{corporatie} reageert al {n} dagen niet op het plan. Nabellen?' },
  { stap: 'keuze_koop', wanneer: `> ${DREMPELS.keuze_koop} dagen sinds het laatste versturen naar de bewoner`, tekst: 'Bewoner kiest al {n} dagen niet tussen Klussendienst of zelf. Nabellen?' },
  { stap: 'uitvoerder', wanneer: `> ${DREMPELS.uitvoerder} dagen sinds goedkeuring/keuze`, tekst: 'Plan al {n} dagen goedgekeurd, nog geen uitvoerder.' },
  { stap: 'uitvoering', wanneer: `> ${DREMPELS.uitvoering} dagen na uitvoering gepland; zonder datum > ${DREMPELS.uitvoering_zonder_datum} dagen sinds de uitvoerder is toegewezen; nooit zolang de geplande datum in de toekomst ligt`, tekst: 'Uitvoering was gepland op {datum}, maar niet opgeleverd. / {uitvoerder} heeft na {n} dagen nog geen uitvoering gepland.' },
  { stap: 'oplevering', wanneer: `> ${DREMPELS.oplevering} dagen sinds werk opgeleverd`, tekst: 'Werk al {n} dagen opgeleverd. Rapport versturen en dossier sluiten?' },
];

export const KLOPT_NIET_REGELS: [string, string][] = [
  ['Een latere stap is gedaan, maar een eerdere stap die van toepassing is niet', '"Stap {nr} ({latere stap}) is gedaan, maar stap {nr} ({eerdere stap}) nog niet."'],
  ['Koopwoning met een goedkeuring van de woningcorporatie', '"Koopwoning, maar met goedkeuring van de woningcorporatie. Klopt huur/koop?"'],
  ['Huurwoning met een keuze van de bewoner (Klussendienst of zelf)', '"Huurwoning, maar met een keuze voor Klussendienst of zelf. Klopt huur/koop?"'],
  ['Rioolstelsel gescheiden, dossier open en voorbij de intake', '"Riool gescheiden, maar het dossier loopt nog. Sluiten, of riool corrigeren?"'],
  ['Gesloten als niet subsidiabel terwijl het rioolstelsel gemengd is', '"Gesloten als niet subsidiabel, maar het riool is gemengd."'],
  ['Bezoek afgerond terwijl de afspraak in de toekomst ligt', '"Bezoek afgerond, maar de afspraak is pas op {datum}."'],
  ['Werk opgeleverd terwijl de geplande uitvoering in de toekomst ligt', '"Werk opgeleverd, maar de uitvoering is pas gepland op {datum}."'],
  ['De bezoeker/uitvoerder van een open stap is gearchiveerd', '"{naam} is gearchiveerd, maar nog {bezoeker/uitvoerder}. Wijs iemand anders toe."'],
];

export function kloptNiet(d: Dossier, gebruikers: Map<number, Gebruiker>, nu: Date): Bevinding[] {
  const uit: Bevinding[] = [];
  const k = (tekst: string, anker: string) => uit.push({ soort: 'klopt_niet', tekst, anker });
  const geldend = STAPPEN.filter((s) => s.nr <= 10 && s.geldt(d));
  const laatsteGedaan = [...geldend].reverse().find((s) => s.gedaan(d) !== null);
  if (laatsteGedaan) {
    for (const s of geldend) {
      if (s.nr >= laatsteGedaan.nr) break;
      if (s.gedaan(d) === null) {
        k(`Stap ${laatsteGedaan.nr} (${laatsteGedaan.label}) is gedaan, maar stap ${s.nr} (${s.label}) nog niet.`, s.anker);
      }
    }
  }
  if (d.huur_koop === 'koop' && d.corporatie_akkoord_at) {
    k('Koopwoning, maar met goedkeuring van de woningcorporatie. Klopt huur/koop?', 'sectie-intake');
  }
  if (d.huur_koop === 'huur' && d.klussendienst_gekozen_at) {
    k('Huurwoning, maar met een keuze voor Klussendienst of zelf. Klopt huur/koop?', 'sectie-intake');
  }
  const huidig = huidigeStap(d);
  const riool = str(d, 'rioolstelsel');
  if (riool === 'gescheiden' && !d.gesloten_at && huidig.nr > 1) {
    k('Riool gescheiden, maar het dossier loopt nog. Sluiten, of riool corrigeren?', 'sectie-intake');
  }
  if (d.gesloten_reden === 'Niet subsidiabel' && riool === 'gemengd') {
    k('Gesloten als niet subsidiabel, maar het riool is gemengd.', 'sectie-intake');
  }
  const afspraak = afspraakDatum(d);
  if (d.bezoek_afgerond_at && afspraak && afspraak > nu) {
    k(`Bezoek afgerond, maar de afspraak is pas op ${datum(afspraak)}.`, 'sectie-bezoek');
  }
  if (d.werk_opgeleverd_at && d.uitvoering_gepland && lokaal(d.uitvoering_gepland) > nu) {
    k(`Werk opgeleverd, maar de uitvoering is pas gepland op ${datum(d.uitvoering_gepland)}.`, 'sectie-uitvoering');
  }
  if (!d.gesloten_at) {
    const gearchiveerd = (id: number | null) => (id !== null ? gebruikers.get(id) : undefined);
    const b = gearchiveerd(d.bezoeker_id);
    if (b && b.archived_at && huidig.nr >= 3 && huidig.nr <= 5) {
      k(`${b.naam} is gearchiveerd, maar nog bezoeker. Wijs iemand anders toe.`, 'sectie-bezoeker');
    }
    const u = gearchiveerd(d.uitvoerder_id);
    if (u && u.archived_at && huidig.nr === 10) {
      k(`${u.naam} is gearchiveerd, maar nog uitvoerder. Wijs iemand anders toe.`, 'sectie-uitvoerder');
    }
  }
  return uit;
}

// When the current step began, for the Ligt stil clock.
function startVan(d: Dossier, s: Stap): string | Date | null {
  switch (s.key) {
    case 'intake': return d.created_at;
    case 'bezoeker': return d.intake_afgerond_at;
    case 'afspraak': return d.bezoeker_toegewezen_at;
    case 'bezoek': return afspraakDatum(d);
    case 'plan': return d.bezoek_afgerond_at;
    case 'versturen': return d.klaar_voor_controle_at;
    case 'akkoord_huur': { const v = laatsteVerzending(d, PLAN_SJABLONEN.corporatie!); return v ? v.created_at : null; }
    case 'keuze_koop': { const v = laatsteVerzending(d, PLAN_SJABLONEN.bewoner!); return v ? v.created_at : null; }
    case 'uitvoerder': return d.huur_koop === 'huur' ? d.corporatie_akkoord_at : d.klussendienst_gekozen_at;
    case 'uitvoering': return d.uitvoering_gepland ? lokaal(d.uitvoering_gepland) : d.uitvoerder_toegewezen_at;
    case 'oplevering': return d.werk_opgeleverd_at;
  }
  throw new Error(`Geen startmoment voor stap ${s.key}`);
}

export function ligtStil(d: Dossier, gebruikers: Map<number, Gebruiker>, nu: Date): Bevinding | null {
  if (d.gesloten_at) return null;
  const s = huidigeStap(d);
  const start = startVan(d, s);
  if (start === null) return null;
  const n = dagenSinds(start, nu);
  const naam = (id: number | null) => (id !== null && gebruikers.has(id) ? gebruikers.get(id)!.naam : 'De klusser');
  let tekst: string | null = null;
  switch (s.key) {
    case 'intake':
      if (n > DREMPELS.intake) {
        const mist = intakeOntbreekt(d);
        tekst = `Intake al ${n} dagen open.${mist.length ? ` Nog niet ingevuld: ${mist.join(', ')}.` : ' Nog niet als compleet gemarkeerd.'}`;
      }
      break;
    case 'bezoeker':
      if (n > DREMPELS.bezoeker) tekst = `Al ${n} dagen geen bezoeker. Nieuwe oproep in de Signal-groep?`;
      break;
    case 'afspraak':
      if (n > DREMPELS.afspraak) tekst = `${naam(d.bezoeker_id)} heeft na ${n} dagen nog geen afspraak gepland.`;
      break;
    case 'bezoek':
      if (n > DREMPELS.bezoek) tekst = `Afspraak was op ${datum(start)}, maar het bezoek is niet afgerond. Doorgegaan?`;
      break;
    case 'plan':
      if (n > DREMPELS.plan) tekst = `Bezoek was ${n} dagen geleden; plan nog niet klaar voor controle.`;
      break;
    case 'versturen':
      if (n > DREMPELS.versturen) tekst = `Plan wacht al ${n} dagen op controle.`;
      break;
    case 'akkoord_huur':
      if (n > DREMPELS.akkoord_huur) tekst = `${corporatieNaam(d) ?? 'De woningcorporatie'} reageert al ${n} dagen niet op het plan. Nabellen?`;
      break;
    case 'keuze_koop':
      if (n > DREMPELS.keuze_koop) tekst = `Bewoner kiest al ${n} dagen niet tussen Klussendienst of zelf. Nabellen?`;
      break;
    case 'uitvoerder':
      if (n > DREMPELS.uitvoerder) tekst = `Plan al ${n} dagen goedgekeurd, nog geen uitvoerder.`;
      break;
    case 'uitvoering':
      if (d.uitvoering_gepland) {
        if (n > DREMPELS.uitvoering) tekst = `Uitvoering was gepland op ${datum(d.uitvoering_gepland)}, maar niet opgeleverd.`;
      } else if (n > DREMPELS.uitvoering_zonder_datum) {
        tekst = `${naam(d.uitvoerder_id)} heeft na ${n} dagen nog geen uitvoering gepland.`;
      }
      break;
    case 'oplevering':
      if (n > DREMPELS.oplevering) tekst = `Werk al ${n} dagen opgeleverd. Rapport versturen en dossier sluiten?`;
      break;
  }
  if (tekst === null) return null;
  const bevinding: Bevinding = { soort: 'ligt_stil', tekst, anker: s.anker, stap: s.key };
  const vandaag = isoDatum(nu);
  const uitstel = [...d.uitstellen].reverse().find((u) => u.stap === s.key && u.tot > vandaag);
  if (uitstel) bevinding.uitgesteld = { tot: uitstel.tot, notitie: uitstel.notitie };
  return bevinding;
}

const ONTVANGER_NAAM: Partial<Record<Ontvanger, string>> = { bewoner: 'de bewoner', corporatie: 'de woningcorporatie', uitvoerder: 'de uitvoerder' };

export function laatsteAck(d: Dossier, o: Ontvanger): string | null {
  const a = d.plan_acks.filter((x) => x.ontvanger === o);
  return a.length ? a[a.length - 1].created_at : null;
}

// Per recipient: the latest plan send, and whether the plan changed after it (and after the last "Opnieuw versturen niet nodig").
export function planStatus(d: Dossier, o: Ontvanger): { verstuurd: string; gewijzigd: string | null } | null {
  const v = laatsteVerzending(d, PLAN_SJABLONEN[o]!);
  if (!v) return null;
  const ack = laatsteAck(d, o);
  const g = d.plan_gewijzigd_at;
  const gewijzigd = g && g > v.created_at && (!ack || g > ack) ? g : null;
  return { verstuurd: v.created_at, gewijzigd };
}

export function planGewijzigd(d: Dossier): Bevinding[] {
  if (d.gesloten_at) return [];
  const uit: Bevinding[] = [];
  for (const o of ['bewoner', 'corporatie', 'uitvoerder'] as Ontvanger[]) {
    const s = planStatus(d, o);
    if (s && s.gewijzigd) {
      uit.push({
        soort: 'plan_gewijzigd',
        tekst: `Plan gewijzigd op ${datum(s.gewijzigd)}, na versturen naar ${ONTVANGER_NAAM[o]}. Opnieuw sturen?`,
        anker: o === 'uitvoerder' ? 'sectie-uitvoerder' : 'sectie-versturen',
        ontvanger: o,
      });
    }
  }
  return uit;
}

export interface Aandacht {
  bevindingen: Bevinding[]; // Klopt niet first; snoozed Ligt stil included but marked
  nodig: boolean; // any finding that isn't snoozed
}

// Admin view. Klussers get `klusserHerinnering` instead.
export function aandacht(d: Dossier, gebruikers: Map<number, Gebruiker>, nu: Date): Aandacht {
  const bevindingen = [...kloptNiet(d, gebruikers, nu), ...planGewijzigd(d)];
  const stil = ligtStil(d, gebruikers, nu);
  if (stil) bevindingen.push(stil);
  return { bevindingen, nodig: bevindingen.some((b) => !b.uitgesteld) };
}

export function klusserHerinnering(d: Dossier, userId: number, gebruikers: Map<number, Gebruiker>, nu: Date): Bevinding | null {
  const stil = ligtStil(d, gebruikers, nu);
  if (!stil) return null;
  const eigen = (['afspraak', 'bezoek', 'plan'].includes(stil.stap!) && d.bezoeker_id === userId) || (stil.stap === 'uitvoering' && d.uitvoerder_id === userId);
  return eigen ? stil : null;
}
