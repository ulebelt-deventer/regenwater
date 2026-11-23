import { CORPORATIES } from '../shared/constants.ts';
import type { Adres, Annotatie, CorporatieAdres, Dossier, Extra, Foto, Gebruiker, IJskast, Json, Normafvoer, NormafvoerRij, PlanAck, Subsidiepagina, Verzending } from '../shared/types.ts';
import { fout } from './context.ts';
import type { DB } from './db.ts';

const NORM_MAX_MM = 100;

export const DOSSIER_KOLOMMEN = [
  'huur_koop', 'eigenaar_id', 'bezoeker_id', 'uitvoerder_id', 'afspraak', 'uitvoering_gepland',
  'inschrijving_afgerond_at', 'inschrijving_afgerond_by', 'bezoeker_toegewezen_at', 'bezoeker_toegewezen_by', 'bezoek_afgerond_at', 'bezoek_afgerond_by',
  'klaar_voor_controle_at', 'klaar_voor_controle_by', 'corporatie_akkoord_at', 'corporatie_akkoord_by',
  'klussendienst_gekozen_at', 'klussendienst_gekozen_by', 'uitvoerder_toegewezen_at', 'uitvoerder_toegewezen_by',
  'werk_opgeleverd_at', 'werk_opgeleverd_by', 'gesloten_at', 'gesloten_by', 'gesloten_reden', 'gesloten_toelichting', 'plan_gewijzigd_at',
] as const;

type Rij = Record<string, unknown> & { id: number; data: string; extra_json: string; adres_json: string | null; laatste_activiteit_at: string | null };

// The unique index ijskast_open allows one per dossier.
const IJSKAST_OPEN = 'SELECT id, dossier_id, tot, reden, created_at, created_by FROM ijskast WHERE eind_at IS NULL';

const SELECT = `SELECT d.*, (SELECT MAX(a.updated_at) FROM audit a WHERE a.dossier_id = d.id) AS laatste_activiteit_at FROM dossiers d`;

function verzendingVan(r: Record<string, unknown>): Verzending {
  return {
    id: r.id as number, sjabloon: r.sjabloon as string, ontvanger: r.ontvanger as Verzending['ontvanger'], aan: r.aan as string, cc: r.cc as string | null,
    onderwerp: r.onderwerp as string, tekst: r.tekst as string, handmatig: r.handmatig === 1, mislukt_at: r.mislukt_at as string | null,
    created_at: r.created_at as string, created_by: r.created_by as number,
  };
}

export function fotoVan(r: Record<string, unknown>): Foto {
  return {
    id: r.id as string, slot: r.slot as string, breedte: r.breedte as number, hoogte: r.hoogte as number, m_per_px: r.m_per_px as number | null,
    annotaties: r.annotaties === undefined ? [] : (JSON.parse(r.annotaties as string) as Annotatie[]), created_at: r.created_at as string,
  };
}

function groepeer<T>(rijen: Record<string, unknown>[], maak: (r: Record<string, unknown>) => T): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rijen) {
    const id = r.dossier_id as number;
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push(maak(r));
  }
  return m;
}

// Every corporatie in CORPORATIES; one the admins haven't filled in yet has empty addresses.
export function corporatieAdressen(db: DB): CorporatieAdres[] {
  const rijen = db.prepare('SELECT * FROM corporatie_adressen').all() as CorporatieAdres[];
  return CORPORATIES.map((corporatie) => rijen.find((r) => r.corporatie === corporatie) ?? { corporatie, aan: '', cc: '' });
}

export const subsidiepaginas = (db: DB) => db.prepare('SELECT * FROM subsidiepaginas ORDER BY gemeente').all() as Subsidiepagina[];

// The link for a dossier's gemeente, or null when the dossier has no adres or its gemeente has no row.
export function subsidiepagina(db: DB, d: Dossier): string | null {
  if (!d.adres) return null;
  return (db.prepare('SELECT url FROM subsidiepaginas WHERE gemeente = ?').pluck().get(d.adres.gemeente) as string | undefined) ?? null;
}

export const normafvoeren = (db: DB) => db.prepare('SELECT * FROM normafvoeren ORDER BY gemeente').all() as NormafvoerRij[];

export function leesNormMm(b: Record<string, unknown>): number {
  if (typeof b.mm !== 'number' || !Number.isInteger(b.mm) || b.mm < 1 || b.mm > NORM_MAX_MM) fout(400, `Vul een heel aantal millimeter in, van 1 tot ${NORM_MAX_MM}.`);
  return b.mm;
}

function normafvoerVan(r: Rij, adres: Adres | null, normen: NormafvoerRij[]): Normafvoer {
  if (r.normafvoer_at !== null) return { mm: r.normafvoer_mm as number, gemeente: r.normafvoer_gemeente as string | null, vast_at: r.normafvoer_at as string, reden: r.normafvoer_reden as string | null };
  const gemeente = adres?.gemeente.toLowerCase();
  const n = normen.find((x) => x.gemeente?.toLowerCase() === gemeente) ?? normen.find((x) => x.gemeente === null);
  if (!n) throw new Error('De standaardrij van de normafvoer ontbreekt');
  return { mm: n.mm, gemeente: n.gemeente, vast_at: null, reden: null };
}

function bouw(r: Rij, rel: { v: Verzending[]; ijs: IJskast | undefined; a: PlanAck[]; h: string[]; f: Foto[]; n: NormafvoerRij[] }): Dossier {
  if (r.eigenaar_id === null) throw new Error(`Dossier ${r.id} heeft geen eigenaar`);
  const d: Record<string, unknown> = { id: r.id, created_at: r.created_at, created_by: r.created_by };
  for (const k of DOSSIER_KOLOMMEN) d[k] = r[k];
  const adres = r.adres_json ? (JSON.parse(r.adres_json) as Adres) : null;
  d.adres = adres;
  d.normafvoer = normafvoerVan(r, adres, rel.n);
  d.data = JSON.parse(r.data) as Record<string, Json>;
  d.extra = JSON.parse(r.extra_json) as Extra;
  d.verzendingen = rel.v;
  d.ijskast = rel.ijs ?? null;
  d.plan_acks = rel.a;
  d.verborgen = rel.h;
  d.fotos = rel.f;
  d.laatste_activiteit_at = r.laatste_activiteit_at;
  return d as unknown as Dossier;
}

export function laadDossier(db: DB, id: number): Dossier | null {
  const r = db.prepare(`${SELECT} WHERE d.id = ?`).get(id) as Rij | undefined;
  if (!r) return null;
  return bouw(r, {
    v: (db.prepare('SELECT * FROM verzendingen WHERE dossier_id = ? ORDER BY id').all(id) as Record<string, unknown>[]).map(verzendingVan),
    ijs: db.prepare(IJSKAST_OPEN + ' AND dossier_id = ?').get(id) as IJskast | undefined,
    a: db.prepare('SELECT * FROM plan_acks WHERE dossier_id = ? ORDER BY id').all(id) as PlanAck[],
    h: (db.prepare('SELECT sleutel FROM verborgen_meldingen WHERE dossier_id = ? ORDER BY id').all(id) as { sleutel: string }[]).map((x) => x.sleutel),
    f: (db.prepare('SELECT * FROM fotos WHERE dossier_id = ? AND verwijderd_at IS NULL ORDER BY created_at, rowid').all(id) as Record<string, unknown>[]).map(fotoVan),
    n: normafvoeren(db),
  });
}

// All dossiers matching a plain SQL condition, with their related rows. Photos come without annotations.
export function laadDossiers(db: DB, waar = '1 = 1', params: unknown[] = []): Dossier[] {
  const rijen = db.prepare(`${SELECT} WHERE ${waar}`).all(...params) as Rij[];
  if (rijen.length === 0) return [];
  const v = groepeer(db.prepare('SELECT * FROM verzendingen ORDER BY id').all() as Record<string, unknown>[], verzendingVan);
  const ijs = new Map((db.prepare(IJSKAST_OPEN).all() as (IJskast & { dossier_id: number })[]).map((r) => [r.dossier_id, r]));
  const a = groepeer(db.prepare('SELECT * FROM plan_acks ORDER BY id').all() as Record<string, unknown>[], (r) => r as unknown as PlanAck);
  const h = groepeer(db.prepare('SELECT dossier_id, sleutel FROM verborgen_meldingen ORDER BY id').all() as Record<string, unknown>[], (r) => r.sleutel as string);
  const f = groepeer(
    db.prepare('SELECT id, dossier_id, slot, breedte, hoogte, m_per_px, created_at FROM fotos WHERE verwijderd_at IS NULL ORDER BY created_at, rowid').all() as Record<string, unknown>[],
    fotoVan,
  );
  const n = normafvoeren(db);
  return rijen.map((r) => bouw(r, { v: v.get(r.id) ?? [], ijs: ijs.get(r.id), a: a.get(r.id) ?? [], h: h.get(r.id) ?? [], f: f.get(r.id) ?? [], n }));
}

export function gebruikersMap(db: DB): Map<number, Gebruiker> {
  const rijen = db.prepare('SELECT * FROM gebruikers').all() as Gebruiker[];
  return new Map(rijen.map((g) => [g.id, g]));
}

export function gebruiker(db: DB, id: number): Gebruiker | null {
  return (db.prepare('SELECT * FROM gebruikers WHERE id = ?').get(id) as Gebruiker | undefined) ?? null;
}
