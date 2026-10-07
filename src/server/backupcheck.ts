import type { DB } from './db.ts';

// Litestream syncs within seconds; an hour leaves room for a write that landed while the restore ran.
const MAX_ACHTERSTAND_MS = 36e5;

// What's wrong with a restored Litestream replica, compared with the live database. Empty means the backup is usable and current.
export function controleerBackup(live: DB, kopie: DB): string[] {
  const integriteit = (kopie.pragma('integrity_check') as { integrity_check: string }[]).map((r) => r.integrity_check);
  if (integriteit.join() !== 'ok') return [`integrity_check: ${integriteit.join('; ')}`];
  const nieuwste = (db: DB) => (db.prepare('SELECT MAX(created_at) AS t FROM audit').get() as { t: string | null }).t;
  const inLive = nieuwste(live);
  const inKopie = nieuwste(kopie);
  if (inLive === null) return [];
  if (inKopie === null) return [`de backup heeft geen audit-events, live wel (nieuwste ${inLive})`];
  if (Date.parse(inLive) - Date.parse(inKopie) > MAX_ACHTERSTAND_MS) return [`de backup loopt achter: nieuwste event ${inKopie}, live ${inLive}`];
  return [];
}
