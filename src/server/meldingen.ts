import { MELDINGEN_EMAIL } from '../shared/constants.ts';
import { audit } from './audit.ts';
import type { Ctx } from './context.ts';
import { log } from './log.ts';

// The app's automatic emails to the admin alert address. A failure here is logged, never shown to the user who triggered it.
export async function melding(ctx: Ctx, onderwerp: string, tekst: string, dossierId: number | null, aan = MELDINGEN_EMAIL): Promise<void> {
  try {
    await ctx.mailer.verstuur({ aan, replyTo: MELDINGEN_EMAIL, onderwerp, tekst });
    audit(ctx, { id: null, als: null }, dossierId, 'melding_verstuurd', { aan, onderwerp });
  } catch (e) {
    log.error(`melding niet verstuurd: ${onderwerp}`, e);
  }
}

export function dossierLink(ctx: Ctx, id: number): string {
  return `${ctx.config.basisUrl}/dossiers/${id}`;
}
