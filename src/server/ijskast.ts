import { datum, lokaal } from '../shared/datum.ts';
import { adresRegel } from '../shared/status.ts';
import { audit } from './audit.ts';
import type { Ctx } from './context.ts';
import { dossierLink, dossierMelding } from './meldingen.ts';
import { gebruiker, laadDossier } from './repo.ts';

// The eigenaar is mailed from this hour (local time) on the day a dossier comes out of the ijskast.
const WEKKER_UUR = 8;

// Mails the eigenaar of each dossier whose ijskast day has come, once: the row is claimed before the mail is sent, so a crash between the two loses that mail rather than sending it twice.
export async function ijskastWekker(ctx: Ctx): Promise<number> {
  const nu = ctx.klok.nu();
  const open = ctx.db.prepare('SELECT id, dossier_id, tot, reden, created_at, created_by FROM ijskast WHERE eind_at IS NULL').all() as { id: number; dossier_id: number; tot: string; reden: string; created_at: string; created_by: number }[];
  let verstuurd = 0;
  for (const k of open.filter((k) => lokaal(`${k.tot}T${String(WEKKER_UUR).padStart(2, '0')}:00`) <= nu)) {
    const geclaimd = ctx.db.prepare('UPDATE ijskast SET eind_at = ? WHERE id = ? AND eind_at IS NULL').run(ctx.klok.iso(), k.id).changes === 1;
    if (!geclaimd) continue;
    audit(ctx, { id: null, als: null }, k.dossier_id, 'ijskast_voorbij', { tot: k.tot });
    const d = laadDossier(ctx.db, k.dossier_id)!;
    const door = gebruiker(ctx.db, k.created_by)!.naam;
    const adres = adresRegel(d);
    await dossierMelding(ctx, d, `Uit de ijskast: ${adres}`, `${adres} is vandaag uit de ijskast gekomen. Wat wil je ermee doen?\n\n${dossierLink(ctx, d.id)}\n\nIn de ijskast gedaan op ${datum(k.created_at)} door ${door}, met als reden:\n${k.reden}`);
    verstuurd++;
  }
  return verstuurd;
}
