import { ULEBELT_CONTACT_EMAIL } from '../shared/constants.ts';
import { audit } from './audit.ts';
import type { MeldingSoort } from './config.ts';
import type { Ctx } from './context.ts';
import { log } from './log.ts';

// The app's automatic emails, one per recipient configured for this soort. A failure is logged, never shown to the user who triggered it, and doesn't stop the other recipients.
export async function melding(ctx: Ctx, soort: MeldingSoort, onderwerp: string, tekst: string, dossierId: number | null): Promise<void> {
  for (const aan of ctx.config.meldingen[soort]) {
    try {
      await ctx.mailer.verstuur({ aan, replyTo: ULEBELT_CONTACT_EMAIL, onderwerp, tekst });
      audit(ctx, { id: null, als: null }, dossierId, 'melding_verstuurd', { aan, onderwerp });
    } catch (e) {
      log.error(`melding niet verstuurd aan ${aan}: ${onderwerp}`, e);
    }
  }
}

export function dossierLink(ctx: Ctx, id: number): string {
  return `${ctx.config.basisUrl}/dossiers/${id}`;
}
