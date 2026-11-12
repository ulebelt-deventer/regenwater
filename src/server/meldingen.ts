import { ULEBELT_CONTACT_EMAIL } from '../shared/constants.ts';
import type { Dossier } from '../shared/types.ts';
import { audit } from './audit.ts';
import type { Ctx } from './context.ts';
import { log } from './log.ts';

// Mails each feedback recipient. A failure is logged, never shown to the user who sent the feedback, and doesn't stop the other recipients.
export async function feedbackMail(ctx: Ctx, onderwerp: string, tekst: string): Promise<void> {
  for (const aan of ctx.config.feedbackAan) {
    try {
      await ctx.mailer.verstuur({ aan, replyTo: ULEBELT_CONTACT_EMAIL, onderwerp, tekst });
      audit(ctx, { id: null, als: null }, null, 'melding_verstuurd', { aan, onderwerp });
    } catch (e) {
      log.error(`melding niet verstuurd aan ${aan}: ${onderwerp}`, e);
    }
  }
}

// An in-app melding under the bell for the dossier's eigenaar. The address is not part of the titel: the bell shows the dossier's current address.
export function dossierMelding(ctx: Ctx, d: Dossier, titel: string, detail: string | null): void {
  ctx.db.prepare('INSERT INTO notificaties (gebruiker_id, dossier_id, titel, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(d.eigenaar_id, d.id, titel, detail, ctx.klok.iso());
}

export function dossierLink(ctx: Ctx, id: number): string {
  return `${ctx.config.basisUrl}/dossiers/${id}`;
}
