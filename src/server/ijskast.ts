import { datum, lokaal } from '../shared/datum.ts';
import { audit } from './audit.ts';
import type { Ctx } from './context.ts';
import { dossierMelding } from './meldingen.ts';
import { gebruiker, laadDossier } from './repo.ts';

// The eigenaar gets the melding from this hour (local time) on the day a dossier comes out of the ijskast.
const WEKKER_UUR = 8;

// Ends each ijskast whose day has come and gives the dossier's eigenaar one melding about it.
export function ijskastWekker(ctx: Ctx): number {
  const nu = ctx.klok.nu();
  const open = ctx.db.prepare('SELECT id, dossier_id, tot, reden, created_at, created_by FROM ijskast WHERE eind_at IS NULL').all() as { id: number; dossier_id: number; tot: string; reden: string; created_at: string; created_by: number }[];
  const voorbij = open.filter((k) => lokaal(`${k.tot}T${String(WEKKER_UUR).padStart(2, '0')}:00`) <= nu);
  ctx.db.transaction(() => {
    for (const k of voorbij) {
      ctx.db.prepare('UPDATE ijskast SET eind_at = ? WHERE id = ?').run(ctx.klok.iso(), k.id);
      audit(ctx, { id: null, als: null }, k.dossier_id, 'ijskast_voorbij', { tot: k.tot });
      const door = gebruiker(ctx.db, k.created_by)!.naam;
      dossierMelding(ctx, laadDossier(ctx.db, k.dossier_id)!, 'Uit de ijskast', `In de ijskast gedaan op ${datum(k.created_at)} door ${door}, met als reden: ${k.reden}`);
    }
  })();
  return voorbij.length;
}
