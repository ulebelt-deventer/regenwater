export type Rol = 'beheerder' | 'klusser';
export type HuurKoop = 'huur' | 'koop';
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
// Which install this is, for the navbar label: dev (local npm run dev), test (STAGING set), or null on the live site.
export type Omgeving = 'dev' | 'test' | null;

export interface Gebruiker {
  id: number;
  naam: string;
  email: string;
  telefoon: string | null;
  rol: Rol;
  created_at: string;
  archived_at: string | null;
  last_active_at: string | null;
}

export interface Adres {
  straat: string;
  huisnummer: number;
  huisletter: string;
  toevoeging: string;
  postcode: string;
  plaats: string;
  gemeente: string;
  percelen: string[];
  rd: [number, number];
  ll: [number, number];
  // Bounding box of all linked parcels in RD meters: [minX, minY, maxX, maxY].
  perceel_bbox: [number, number, number, number] | null;
}

export type Stelsel = 'gemengd' | 'gescheiden';

// stelsel null: the source could not tell; uitleg says why.
export interface RioolUitslag {
  stelsel: Stelsel | null;
  uitleg: string;
}

// The app's own guess at the rioolstelsel from the gemeente's rioolkaart, made when the address is chosen.
export type RioolDetectie = (({ soort: 'gevonden' } & RioolUitslag) | { soort: 'niet_ondersteund' } | { soort: 'fout'; bericht: string }) & { at: string };

// Values the app derives itself, not entered by anyone.
export interface Extra {
  riool?: RioolDetectie;
}

export const MIJLPALEN = [
  'inschrijving_afgerond',
  'bezoeker_toegewezen',
  'bezoek_afgerond',
  'klaar_voor_controle',
  'corporatie_akkoord',
  'klussendienst_gekozen',
  'uitvoerder_toegewezen',
  'werk_opgeleverd',
] as const;
export type Mijlpaal = (typeof MIJLPALEN)[number];

export const SLUIT_REDENEN = [
  'Uitgevoerd',
  'Niet subsidiabel',
  'Plan afgewezen',
  'Bewoner doet het zelf',
  'Bewoner afgehaakt',
  'Anders',
] as const;
export type SluitReden = (typeof SLUIT_REDENEN)[number];

export type Ontvanger = 'bewoner' | 'corporatie' | 'bezoeker' | 'uitvoerder';

export interface Verzending {
  id: number;
  sjabloon: string;
  ontvanger: Ontvanger;
  aan: string;
  cc: string | null;
  onderwerp: string;
  tekst: string;
  handmatig: boolean;
  mislukt_at: string | null;
  created_at: string;
  created_by: number;
}

export interface Uitstel {
  id: number;
  stap: string;
  tot: string; // YYYY-MM-DD
  notitie: string;
  created_at: string;
  created_by: number;
}

export interface PlanAck {
  id: number;
  ontvanger: Ontvanger;
  notitie: string;
  created_at: string;
  created_by: number;
}

export interface Foto {
  id: string;
  slot: string;
  breedte: number;
  hoogte: number;
  // Meters per pixel, only for an auto-loaded luchtfoto.
  m_per_px: number | null;
  annotaties: Annotatie[];
  created_at: string;
}

export type AnnotatieType = 'schets' | 'pijl' | 'tekst' | 'dak' | 'tuin' | 'steen' | 'regenpijp';
export interface Annotatie {
  id: string;
  type: AnnotatieType;
  p: [number, number][];
  tekst?: string;
}

// Everything the shared rules need about one dossier. The server assembles it from the row and its related tables.
export interface Dossier {
  id: number;
  created_at: string;
  created_by: number;
  adres: Adres | null;
  huur_koop: HuurKoop | null;
  bezoeker_id: number | null;
  uitvoerder_id: number | null;
  afspraak: string | null; // YYYY-MM-DDTHH:MM, local time
  uitvoering_gepland: string | null; // YYYY-MM-DD
  inschrijving_afgerond_at: string | null;
  inschrijving_afgerond_by: number | null;
  bezoeker_toegewezen_at: string | null;
  bezoeker_toegewezen_by: number | null;
  bezoek_afgerond_at: string | null;
  bezoek_afgerond_by: number | null;
  klaar_voor_controle_at: string | null;
  klaar_voor_controle_by: number | null;
  corporatie_akkoord_at: string | null;
  corporatie_akkoord_by: number | null;
  klussendienst_gekozen_at: string | null;
  klussendienst_gekozen_by: number | null;
  uitvoerder_toegewezen_at: string | null;
  uitvoerder_toegewezen_by: number | null;
  werk_opgeleverd_at: string | null;
  werk_opgeleverd_by: number | null;
  gesloten_at: string | null;
  gesloten_by: number | null;
  gesloten_reden: SluitReden | null;
  gesloten_toelichting: string | null;
  plan_gewijzigd_at: string | null;
  data: Record<string, Json>;
  extra: Extra;
  verzendingen: Verzending[];
  uitstellen: Uitstel[];
  plan_acks: PlanAck[];
  fotos: Foto[];
  laatste_activiteit_at: string | null;
}
