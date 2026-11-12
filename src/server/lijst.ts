import { aandacht, klusserHerinnering } from '../shared/aandacht.ts';
import { isoDatum, lokaal } from '../shared/datum.ts';
import { kaartItems } from '../shared/kaart.ts';
import {
  type LigtBij, PLAN_BEWONER_SJABLONEN, STATUS_FILTERS, SUBSIDIE_SJABLONEN, adresRegel, corporatieNaam, eersteVerzending, huidigeStap, ijskastLabel, inIjskast, opdracht, status, str,
} from '../shared/status.ts';
import { materiaalRijen, materiaalTotaal, optieLabel, veld } from '../shared/velden.ts';
import type { Dossier, Gebruiker } from '../shared/types.ts';

// One row of the dossiers list, the Gebruiker page and the Overzicht, as the client renders it.
export interface LijstRij {
  id: number;
  adres: string;
  plaats: string | null;
  huur_koop: string | null;
  bezoeker: string | null;
  uitvoerder: string | null;
  stapNr: number;
  status: string;
  ligtBij: LigtBij | null;
  ijskast: boolean;
  gesloten: boolean;
  uitgevoerd: boolean;
  aandacht: boolean;
  laatste_activiteit_at: string | null;
  created_at: string;
  notities: string | null;
  afspraak: string | null;
  // Only for the klusser's own view
  opdracht?: { rol: 'Bezoek' | 'Uitvoering'; aanZet: boolean; klaar: boolean } | null;
  volgende?: string;
  herinnering?: string | null;
}

const naam = (g: Map<number, Gebruiker>, id: number | null) => (id === null ? null : g.get(id)!.naam);

// Muted "Volgende stap" text for a klusser when it isn't their turn, eg "Wordt uitgevoerd door Henk".
function volgendeTekst(d: Dossier, g: Map<number, Gebruiker>): string {
  const s = huidigeStap(d);
  if (d.gesloten_at) return `Gesloten: ${d.gesloten_reden}`;
  const bezoeker = naam(g, d.bezoeker_id);
  const uitvoerder = naam(g, d.uitvoerder_id);
  switch (s.key) {
    case 'afspraak':
    case 'bezoek':
    case 'plan':
      return `${s.label} (${bezoeker})`;
    case 'versturen':
      return 'Plan wordt gecontroleerd door de beheerders';
    case 'akkoord_huur':
      return `Wacht op ${corporatieNaam(d) ?? 'de woningcorporatie'}`;
    case 'keuze_koop':
      return 'Wacht op de keuze van de bewoner';
    case 'uitvoerder':
      return 'Wacht op een uitvoerder';
    case 'uitvoering':
      return `Wordt uitgevoerd door ${uitvoerder}`;
    default:
      return `${s.label} (beheerders)`;
  }
}

export function lijstRij(d: Dossier, g: Map<number, Gebruiker>, nu: Date, ik: Gebruiker): LijstRij {
  const st = status(d);
  const ijskast = inIjskast(d, nu);
  const notities = d.data.notities;
  const rij: LijstRij = {
    id: d.id,
    adres: adresRegel(d),
    plaats: d.adres ? d.adres.plaats : null,
    huur_koop: d.huur_koop,
    bezoeker: naam(g, d.bezoeker_id),
    uitvoerder: naam(g, d.uitvoerder_id),
    stapNr: st.stap.nr,
    status: ijskast ? ijskastLabel(ijskast) : st.label,
    ligtBij: st.ligtBij,
    ijskast: ijskast !== null,
    gesloten: st.gesloten,
    uitgevoerd: d.gesloten_reden === 'Uitgevoerd',
    aandacht: ik.rol === 'beheerder' ? aandacht(d, g, nu).nodig : false,
    laatste_activiteit_at: d.laatste_activiteit_at,
    created_at: d.created_at,
    notities: typeof notities === 'string' && notities.trim() ? notities : null,
    afspraak: d.afspraak,
  };
  if (ik.rol === 'klusser') {
    rij.opdracht = opdracht(d, ik.id);
    rij.volgende = ijskast ? ijskastLabel(ijskast) : volgendeTekst(d, g);
    const h = klusserHerinnering(d, ik.id, g, nu);
    rij.herinnering = h ? h.tekst : null;
  }
  return rij;
}

export interface Filters {
  adres?: string;
  plaats?: string;
  bezoeker?: number;
  uitvoerder?: number;
  eigenaar?: number;
  ligtBij?: string;
  aandacht?: boolean;
  stap?: [number, number]; // step range, only linked from the Overzicht
  status: Record<string, 'ja' | 'nee' | null>;
  sorteer: string;
}

export const SORTERINGEN: [string, string][] = [
  ['nieuw', 'Nieuwste'],
  ['oud', 'Oudste'],
  ['activiteit', 'Laatste activiteit'],
  ['adres', 'Adres'],
  ['status', 'Stap'],
  ['afspraak', 'Eerstvolgende afspraak'],
];

export function leesFilters(q: Record<string, string>): Filters {
  const status: Filters['status'] = {};
  for (const f of STATUS_FILTERS) {
    const v = q[`s_${f.key}`];
    status[f.key] = v === 'ja' || v === 'nee' ? v : v === 'alle' ? null : f.standaard;
  }
  const getal = (s: string | undefined) => (s ? Number(s) : undefined);
  const stap = /^(\d+)-(\d+)$/.exec(q.stap ?? '');
  return {
    stap: stap ? [Number(stap[1]), Number(stap[2])] : undefined,
    adres: q.adres?.trim() || undefined,
    plaats: q.plaats?.trim() || undefined,
    bezoeker: getal(q.bezoeker),
    uitvoerder: getal(q.uitvoerder),
    eigenaar: getal(q.eigenaar),
    ligtBij: q.ligt_bij || undefined,
    aandacht: q.aandacht === '1',
    status,
    sorteer: SORTERINGEN.some(([k]) => k === q.sorteer) ? q.sorteer : 'nieuw',
  };
}

const normaal = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export function filter(dossiers: Dossier[], rijen: Map<number, LijstRij>, f: Filters, nu: Date): Dossier[] {
  return dossiers.filter((d) => {
    const r = rijen.get(d.id)!;
    if (f.adres) {
      const a = d.adres;
      const hooi = a ? normaal(`${a.straat}${a.huisnummer}${a.huisletter}${a.toevoeging} ${a.postcode} ${a.straat} ${a.huisnummer}`) : '';
      if (!hooi.includes(normaal(f.adres))) return false;
    }
    if (f.plaats && (!d.adres || d.adres.plaats.toLowerCase() !== f.plaats.toLowerCase())) return false;
    if (f.bezoeker !== undefined && d.bezoeker_id !== f.bezoeker) return false;
    if (f.uitvoerder !== undefined && d.uitvoerder_id !== f.uitvoerder) return false;
    if (f.eigenaar !== undefined && d.eigenaar_id !== f.eigenaar) return false;
    if (f.ligtBij && r.ligtBij !== f.ligtBij) return false;
    if (f.aandacht && !r.aandacht) return false;
    if (f.stap && (r.stapNr < f.stap[0] || r.stapNr > f.stap[1])) return false;
    for (const sf of STATUS_FILTERS) {
      const want = f.status[sf.key];
      if (want !== null && sf.test(d, nu) !== (want === 'ja')) return false;
    }
    return true;
  });
}

export function sorteer(rijen: LijstRij[], sorteer: string, nu: Date): LijstRij[] {
  const uit = [...rijen];
  const tekst = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true });
  switch (sorteer) {
    case 'oud':
      return uit.sort((a, b) => tekst(a.created_at, b.created_at) || a.id - b.id);
    case 'activiteit':
      return uit.sort((a, b) => tekst(b.laatste_activiteit_at ?? '', a.laatste_activiteit_at ?? ''));
    case 'adres':
      return uit.sort((a, b) => tekst(a.adres, b.adres));
    case 'status':
      return uit.sort((a, b) => Number(a.gesloten) - Number(b.gesloten) || a.stapNr - b.stapNr || b.id - a.id);
    case 'afspraak': {
      // Upcoming afspraken first, soonest first; the rest after, newest dossier first.
      const komend = (r: LijstRij) => (r.afspraak && lokaal(r.afspraak) >= nu ? lokaal(r.afspraak).getTime() : Infinity);
      return uit.sort((a, b) => komend(a) - komend(b) || b.id - a.id);
    }
    default:
      return uit.sort((a, b) => tekst(b.created_at, a.created_at) || b.id - a.id);
  }
}

// CSV in the Dutch Excel dialect: semicolons, decimal commas, a BOM so the accents survive.
export function csv(rijen: (string | number | null)[][]): string {
  const cel = (v: string | number | null) => {
    if (v === null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rijen.map((r) => r.map(cel).join(';')).join('\r\n')}\r\n`;
}

function dakTotaal(d: Dossier): number | null {
  const daken = kaartItems(d).daken.filter((x) => x.m2 !== null);
  if (daken.length === 0) return null;
  return Math.round(daken.reduce((s, x) => s + x.m2!, 0) * 10) / 10;
}

const CSV_KOP = [
  'Dossier-ID', 'Aangemaakt op', 'Straat', 'Huisnummer', 'Postcode', 'Plaats', 'Gemeente', 'Huur/koop', 'Woningeigenaar', 'Woningtype', 'Rioolstelsel',
  'Bewoner naam', 'Bewoner e-mail', 'Bewoner telefoon', 'Bezoeker', 'Uitvoerder', 'Status', 'Aandacht nodig',
  'Subsidiemail', 'Bezoeker toegewezen', 'Afspraak', 'Bezoek afgerond', 'Klaar voor controle', 'Plan verstuurd naar bewoner',
  'Plan verstuurd naar woningcorporatie', 'Akkoord', 'Uitvoerder toegewezen', 'Uitvoering gepland', 'Werk opgeleverd', 'Opleverrapport verstuurd', 'Gesloten',
  'Reden gesloten', 'Dak m² (totaal)', 'Aantal regenpijpen', 'Regentonnen gewenst', 'Geschatte materiaalkosten', 'Gebruikte materiaalkosten',
];

// One row per dossier, in the given order. Dates as YYYY-MM-DD and amounts as plain numbers, so Excel can sum them.
export function csvExport(dossiers: Dossier[], rijen: Map<number, LijstRij>): string {
  const dag = (s: string | null | undefined) => (s ? isoDatum(s) : null);
  const eerste = (d: Dossier, sj: string[]) => dag(eersteVerzending(d, sj)?.created_at);
  const uit = dossiers.map((d) => {
    const r = rijen.get(d.id)!;
    const a = d.adres;
    const items = kaartItems(d);
    const optie = (key: string) => optieLabel(veld(key), d, key);
    return [
      d.id, dag(d.created_at), a ? a.straat : null, a ? `${a.huisnummer}${a.huisletter}${a.toevoeging ? `-${a.toevoeging}` : ''}` : null,
      a ? a.postcode : null, a ? a.plaats : null, a ? a.gemeente : null, d.huur_koop, corporatieNaam(d), optie('woningtype'), optie('rioolstelsel'),
      str(d, 'bewoner_naam'), str(d, 'bewoner_email'), str(d, 'bewoner_telefoon'), r.bezoeker, r.uitvoerder, r.status, r.aandacht ? 'ja' : 'nee',
      eerste(d, SUBSIDIE_SJABLONEN), dag(d.bezoeker_toegewezen_at), dag(d.afspraak), dag(d.bezoek_afgerond_at), dag(d.klaar_voor_controle_at),
      eerste(d, PLAN_BEWONER_SJABLONEN), eerste(d, ['plan_corporatie']), dag(d.corporatie_akkoord_at ?? d.klussendienst_gekozen_at),
      dag(d.uitvoerder_toegewezen_at), dag(d.uitvoering_gepland), dag(d.werk_opgeleverd_at), eerste(d, ['oplever_corporatie', 'oplever_bewoner']), dag(d.gesloten_at),
      d.gesloten_reden, dakTotaal(d), items.regenpijpen.length, items.regenpijpen.filter((p) => d.data[`regenpijp.${p.id}.regenton`] === 'gewenst').length,
      materiaalTotaal(materiaalRijen(d, 'materialen')) / 100, materiaalTotaal(materiaalRijen(d, 'gebruikt')) / 100,
    ];
  });
  return csv([CSV_KOP, ...uit]);
}
