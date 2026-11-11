import { ULEBELT_CONTACT_EMAIL } from '../shared/constants.ts';
import type { Dossier } from '../shared/types.ts';
import { audit } from './audit.ts';
import type { MeldingSoort } from './config.ts';
import type { Ctx } from './context.ts';
import { log } from './log.ts';
import { gebruiker } from './repo.ts';

// The app's automatic emails. A failure is logged, never shown to the user who triggered it, and doesn't stop the other recipients.
async function verstuur(ctx: Ctx, aan: string[], onderwerp: string, tekst: string, dossierId: number | null): Promise<void> {
  for (const a of aan) {
    try {
      await ctx.mailer.verstuur({ aan: a, replyTo: ULEBELT_CONTACT_EMAIL, onderwerp, tekst });
      audit(ctx, { id: null, als: null }, dossierId, 'melding_verstuurd', { aan: a, onderwerp });
    } catch (e) {
      log.error(`melding niet verstuurd aan ${a}: ${onderwerp}`, e);
    }
  }
}

// One email per recipient configured for this soort.
export function melding(ctx: Ctx, soort: MeldingSoort, onderwerp: string, tekst: string): Promise<void> {
  return verstuur(ctx, ctx.config.meldingen[soort], onderwerp, tekst, null);
}

// To the dossier's eigenaar.
export function dossierMelding(ctx: Ctx, d: Dossier, onderwerp: string, tekst: string): Promise<void> {
  const eigenaar = gebruiker(ctx.db, d.eigenaar_id)!;
  return verstuur(ctx, [eigenaar.email], onderwerp, tekst, d.id);
}

export function dossierLink(ctx: Ctx, id: number): string {
  return `${ctx.config.basisUrl}/dossiers/${id}`;
}
