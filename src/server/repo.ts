import type { Adres, Annotatie, Dossier, Extra, Foto, Gebruiker, Json, PlanAck, Uitstel, Verzending } from '../shared/types.ts';
import type { DB } from './db.ts';

export const DOSSIER_KOLOMMEN = [
  'huur_koop', 'bezoeker_id', 'uitvoerder_id', 'afspraak', 'uitvoering_gepland',
  'bezoeker_toegewezen_at', 'bezoeker_toegewezen_by', 'bezoek_afgerond_at', 'bezoek_afgerond_by',
  'klaar_voor_controle_at', 'klaar_voor_controle_by', 'corporatie_akkoord_at', 'corporatie_akkoord_by',
  'klussendienst_gekozen_at', 'klussendienst_gekozen_by', 'uitvoerder_toegewezen_at', 'uitvoerder_toegewezen_by',
  'werk_opgeleverd_at', 'werk_opgeleverd_by', 'gesloten_at', 'gesloten_by', 'gesloten_reden', 'gesloten_toelichting', 'plan_gewijzigd_at',
] as const;

type Rij = Record<string, unknown> & { id: number; data: string; extra_json: string; adres_json: string | null; laatste_activiteit_at: string | null };

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

function bouw(r: Rij, rel: { v: Verzending[]; u: Uitstel[]; a: PlanAck[]; f: Foto[] }): Dossier {
  const d: Record<string, unknown> = { id: r.id, created_at: r.created_at, created_by: r.created_by };
  for (const k of DOSSIER_KOLOMMEN) d[k] = r[k];
  d.adres = r.adres_json ? (JSON.parse(r.adres_json) as Adres) : null;
  d.data = JSON.parse(r.data) as Record<string, Json>;
  d.extra = JSON.parse(r.extra_json) as Extra;
  d.verzendingen = rel.v;
  d.uitstellen = rel.u;
  d.plan_acks = rel.a;
  d.fotos = rel.f;
  d.laatste_activiteit_at = r.laatste_activiteit_at;
  return d as unknown as Dossier;
}

export function laadDossier(db: DB, id: number): Dossier | null {
  const r = db.prepare(`${SELECT} WHERE d.id = ?`).get(id) as Rij | undefined;
  if (!r) return null;
  return bouw(r, {
    v: (db.prepare('SELECT * FROM verzendingen WHERE dossier_id = ? ORDER BY id').all(id) as Record<string, unknown>[]).map(verzendingVan),
    u: db.prepare('SELECT * FROM uitstellen WHERE dossier_id = ? ORDER BY id').all(id) as Uitstel[],
    a: db.prepare('SELECT * FROM plan_acks WHERE dossier_id = ? ORDER BY id').all(id) as PlanAck[],
    f: (db.prepare('SELECT * FROM fotos WHERE dossier_id = ? AND verwijderd_at IS NULL ORDER BY created_at, rowid').all(id) as Record<string, unknown>[]).map(fotoVan),
  });
}

// All dossiers matching a plain SQL condition, with their related rows. Photos come without annotations.
export function laadDossiers(db: DB, waar = '1 = 1', params: unknown[] = []): Dossier[] {
  const rijen = db.prepare(`${SELECT} WHERE ${waar}`).all(...params) as Rij[];
  if (rijen.length === 0) return [];
  const v = groepeer(db.prepare('SELECT * FROM verzendingen ORDER BY id').all() as Record<string, unknown>[], verzendingVan);
  const u = groepeer(db.prepare('SELECT * FROM uitstellen ORDER BY id').all() as Record<string, unknown>[], (r) => r as unknown as Uitstel);
  const a = groepeer(db.prepare('SELECT * FROM plan_acks ORDER BY id').all() as Record<string, unknown>[], (r) => r as unknown as PlanAck);
  const f = groepeer(
    db.prepare('SELECT id, dossier_id, slot, breedte, hoogte, m_per_px, created_at FROM fotos WHERE verwijderd_at IS NULL ORDER BY created_at, rowid').all() as Record<string, unknown>[],
    fotoVan,
  );
  return rijen.map((r) => bouw(r, { v: v.get(r.id) ?? [], u: u.get(r.id) ?? [], a: a.get(r.id) ?? [], f: f.get(r.id) ?? [] }));
}

export function gebruikersMap(db: DB): Map<number, Gebruiker> {
  const rijen = db.prepare('SELECT * FROM gebruikers').all() as Gebruiker[];
  return new Map(rijen.map((g) => [g.id, g]));
}

export function gebruiker(db: DB, id: number): Gebruiker | null {
  return (db.prepare('SELECT * FROM gebruikers WHERE id = ?').get(id) as Gebruiker | undefined) ?? null;
}
