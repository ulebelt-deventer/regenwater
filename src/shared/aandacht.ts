import { datum, dagenSinds, lokaal, isoDatum } from './datum.ts';
import {
  STAPPEN, PLAN_SJABLONEN, SUBSIDIE_SJABLONEN, afspraakDatum, corporatieNaam, eersteVerzending, huidigeStap, intakeOntbreekt,
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

export const KLOPT_NIET_KOP = 'Het systeem kan de status van dit dossier niet goed bepalen. Controleer:';

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
  { stap: 'intake', wanneer: `> ${DREMPELS.intake} dagen sinds aangemaakt`, tekst: 'Intake staat al {n} dagen open. Nog nodig: {ontbrekende velden}.' },
  { stap: 'bezoeker', wanneer: `> ${DREMPELS.bezoeker} dagen sinds de eerste subsidiemail`, tekst: 'Al {n} dagen geen bezoeker. Zet eventueel een (nieuwe) oproep in de Signal-groep.' },
  { stap: 'afspraak', wanneer: `> ${DREMPELS.afspraak} dagen sinds de bezoeker is toegewezen`, tekst: '{bezoeker} is {n} dagen geleden toegewezen, maar er is nog geen afspraak gepland.' },
  { stap: 'bezoek', wanneer: `> ${DREMPELS.bezoek} dagen na de afspraak; nooit zolang de afspraak in de toekomst ligt`, tekst: 'De afspraak was op {datum}, {n} dagen geleden, maar het bezoek is nog niet afgerond. Is het doorgegaan?' },
  { stap: 'plan', wanneer: `> ${DREMPELS.plan} dagen sinds bezoek afgerond`, tekst: 'Het bezoek was {n} dagen geleden; het Plan van Aanpak is nog niet klaar voor controle.' },
  { stap: 'versturen', wanneer: `> ${DREMPELS.versturen} dagen sinds klaar voor controle`, tekst: 'Het Plan van Aanpak wacht al {n} dagen op controle en versturen.' },
  { stap: 'akkoord_huur', wanneer: `> ${DREMPELS.akkoord_huur} dagen sinds het laatste versturen naar de woningcorporatie`, tekst: '{corporatie} heeft na {n} dagen nog niet gereageerd op het plan. Tijd om na te bellen?' },
  { stap: 'keuze_koop', wanneer: `> ${DREMPELS.keuze_koop} dagen sinds het laatste versturen naar de bewoner`, tekst: 'De bewoner heeft na {n} dagen nog niet laten weten of ze de Klussendienst willen. Tijd om na te bellen?' },
  { stap: 'uitvoerder', wanneer: `> ${DREMPELS.uitvoerder} dagen sinds goedkeuring/keuze`, tekst: 'Het plan is {n} dagen geleden goedgekeurd, maar er is nog geen uitvoerder.' },
  { stap: 'uitvoering', wanneer: `> ${DREMPELS.uitvoering} dagen na uitvoering gepland; zonder datum > ${DREMPELS.uitvoering_zonder_datum} dagen sinds de uitvoerder is toegewezen; nooit zolang de geplande datum in de toekomst ligt`, tekst: 'De uitvoering stond gepland op {datum}, maar is nog niet opgeleverd. / {uitvoerder} is {n} dagen geleden toegewezen, maar er is nog geen uitvoering gepland of opgeleverd.' },
  { stap: 'oplevering', wanneer: `> ${DREMPELS.oplevering} dagen sinds werk opgeleverd`, tekst: 'Het werk is {n} dagen geleden opgeleverd; het opleverrapport is nog niet verstuurd en het dossier niet gesloten.' },
];

export const KLOPT_NIET_REGELS: [string, string][] = [
  ['Een latere stap is geregistreerd, maar een eerdere stap die van toepassing is niet', '"{latere stap} is geregistreerd, maar {eerdere stap} niet. Registreer dat alsnog, of controleer of {latere stap} klopt."'],
  ['Koopwoning met een goedkeuring van de woningcorporatie', '"Dit is een koopwoning, maar er is een goedkeuring van de woningcorporatie geregistreerd. Klopt huur/koop?"'],
  ['Huurwoning met een keuze van de bewoner (Klussendienst of zelf)', '"Dit is een huurwoning, maar er is een keuze van de bewoner (Klussendienst of zelf) geregistreerd. Klopt huur/koop?"'],
  ['Rioolstelsel gescheiden, dossier open en voorbij de intake', '"Rioolstelsel staat op gescheiden (niet subsidiabel), maar het dossier loopt nog. Sluit het dossier, of corrigeer het rioolstelsel."'],
  ['Gesloten als niet subsidiabel terwijl het rioolstelsel gemengd is', '"Gesloten als niet subsidiabel, maar het rioolstelsel staat op gemengd."'],
  ['Bezoek afgerond terwijl de afspraak in de toekomst ligt', '"Het bezoek is afgerond, maar de afspraak staat op {datum}, in de toekomst. Klopt de afspraakdatum?"'],
  ['Werk opgeleverd terwijl de geplande uitvoering in de toekomst ligt', '"Het werk is opgeleverd, maar de uitvoering staat gepland op {datum}, in de toekomst."'],
  ['De bezoeker/uitvoerder van een open stap is gearchiveerd', '"{naam} is gearchiveerd, maar is nog {bezoeker/uitvoerder} van dit dossier. Wijs iemand anders toe."'],
];

function zin(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function kloptNiet(d: Dossier, gebruikers: Map<number, Gebruiker>, nu: Date): Bevinding[] {
  const uit: Bevinding[] = [];
  const k = (tekst: string, anker: string) => uit.push({ soort: 'klopt_niet', tekst, anker });
  const geldend = STAPPEN.filter((s) => s.nr <= 10 && s.geldt(d));
  const laatsteGedaan = [...geldend].reverse().find((s) => s.gedaan(d) !== null);
  if (laatsteGedaan) {
    for (const s of geldend) {
      if (s.nr >= laatsteGedaan.nr) break;
      if (s.gedaan(d) === null) {
        k(`${zin(laatsteGedaan.mijlpaal)} is geregistreerd, maar ${s.mijlpaal.charAt(0).toLowerCase() + s.mijlpaal.slice(1)} niet. Registreer dat alsnog, of controleer of ${laatsteGedaan.mijlpaal.charAt(0).toLowerCase() + laatsteGedaan.mijlpaal.slice(1)} klopt.`, s.anker);
      }
    }
  }
  if (d.huur_koop === 'koop' && d.corporatie_akkoord_at) {
    k('Dit is een koopwoning, maar er is een goedkeuring van de woningcorporatie geregistreerd. Klopt huur/koop?', 'sectie-intake');
  }
  if (d.huur_koop === 'huur' && d.klussendienst_gekozen_at) {
    k('Dit is een huurwoning, maar er is een keuze van de bewoner (Klussendienst of zelf) geregistreerd. Klopt huur/koop?', 'sectie-intake');
  }
  const huidig = huidigeStap(d);
  const riool = str(d, 'rioolstelsel');
  if (riool === 'gescheiden' && !d.gesloten_at && huidig.nr > 1) {
    k('Rioolstelsel staat op gescheiden (niet subsidiabel), maar het dossier loopt nog. Sluit het dossier, of corrigeer het rioolstelsel.', 'sectie-intake');
  }
  if (d.gesloten_reden === 'Niet subsidiabel' && riool === 'gemengd') {
    k('Gesloten als niet subsidiabel, maar het rioolstelsel staat op gemengd.', 'sectie-intake');
  }
  const afspraak = afspraakDatum(d);
  if (d.bezoek_afgerond_at && afspraak && afspraak > nu) {
    k(`Het bezoek is afgerond, maar de afspraak staat op ${datum(afspraak)}, in de toekomst. Klopt de afspraakdatum?`, 'sectie-bezoek');
  }
  if (d.werk_opgeleverd_at && d.uitvoering_gepland && lokaal(d.uitvoering_gepland) > nu) {
    k(`Het werk is opgeleverd, maar de uitvoering staat gepland op ${datum(d.uitvoering_gepland)}, in de toekomst.`, 'sectie-uitvoering');
  }
  if (!d.gesloten_at) {
    const gearchiveerd = (id: number | null) => (id !== null ? gebruikers.get(id) : undefined);
    const b = gearchiveerd(d.bezoeker_id);
    if (b && b.archived_at && huidig.nr >= 3 && huidig.nr <= 5) {
      k(`${b.naam} is gearchiveerd, maar is nog bezoeker van dit dossier. Wijs iemand anders toe.`, 'sectie-bezoeker');
    }
    const u = gearchiveerd(d.uitvoerder_id);
    if (u && u.archived_at && huidig.nr === 10) {
      k(`${u.naam} is gearchiveerd, maar is nog uitvoerder van dit dossier. Wijs iemand anders toe.`, 'sectie-uitvoerder');
    }
  }
  return uit;
}

// When the current step began, for the Ligt stil clock.
function startVan(d: Dossier, s: Stap): string | Date | null {
  switch (s.key) {
    case 'intake': return d.created_at;
    case 'bezoeker': { const v = eersteVerzending(d, SUBSIDIE_SJABLONEN); return v ? v.created_at : null; }
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
      if (n > DREMPELS.intake) tekst = `Intake staat al ${n} dagen open. Nog nodig: ${intakeOntbreekt(d).join(', ')}.`;
      break;
    case 'bezoeker':
      if (n > DREMPELS.bezoeker) tekst = `Al ${n} dagen geen bezoeker. Zet eventueel een (nieuwe) oproep in de Signal-groep.`;
      break;
    case 'afspraak':
      if (n > DREMPELS.afspraak) tekst = `${naam(d.bezoeker_id)} is ${n} dagen geleden toegewezen, maar er is nog geen afspraak gepland.`;
      break;
    case 'bezoek':
      if (n > DREMPELS.bezoek) tekst = `De afspraak was op ${datum(start)}, ${n} dagen geleden, maar het bezoek is nog niet afgerond. Is het doorgegaan?`;
      break;
    case 'plan':
      if (n > DREMPELS.plan) tekst = `Het bezoek was ${n} dagen geleden; het Plan van Aanpak is nog niet klaar voor controle.`;
      break;
    case 'versturen':
      if (n > DREMPELS.versturen) tekst = `Het Plan van Aanpak wacht al ${n} dagen op controle en versturen.`;
      break;
    case 'akkoord_huur':
      if (n > DREMPELS.akkoord_huur) tekst = `${corporatieNaam(d) ?? 'De woningcorporatie'} heeft na ${n} dagen nog niet gereageerd op het plan. Tijd om na te bellen?`;
      break;
    case 'keuze_koop':
      if (n > DREMPELS.keuze_koop) tekst = `De bewoner heeft na ${n} dagen nog niet laten weten of ze de Klussendienst willen. Tijd om na te bellen?`;
      break;
    case 'uitvoerder':
      if (n > DREMPELS.uitvoerder) tekst = `Het plan is ${n} dagen geleden goedgekeurd, maar er is nog geen uitvoerder.`;
      break;
    case 'uitvoering':
      if (d.uitvoering_gepland) {
        if (n > DREMPELS.uitvoering) tekst = `De uitvoering stond gepland op ${datum(d.uitvoering_gepland)}, maar is nog niet opgeleverd.`;
      } else if (n > DREMPELS.uitvoering_zonder_datum) {
        tekst = `${naam(d.uitvoerder_id)} is ${n} dagen geleden toegewezen, maar er is nog geen uitvoering gepland of opgeleverd.`;
      }
      break;
    case 'oplevering':
      if (n > DREMPELS.oplevering) tekst = `Het werk is ${n} dagen geleden opgeleverd; het opleverrapport is nog niet verstuurd en het dossier niet gesloten.`;
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
        tekst: `Het plan is gewijzigd op ${datum(s.gewijzigd)}, na het versturen naar ${ONTVANGER_NAAM[o]} op ${datum(s.verstuurd)}. Stuur het opnieuw, of markeer dat dat niet nodig is.`,
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
