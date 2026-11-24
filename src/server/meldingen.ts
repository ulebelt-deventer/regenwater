import type { Dossier, NotificatieSoort } from '../shared/types.ts';
import type { Ctx } from './context.ts';
import { log } from './log.ts';

// Mails each feedback recipient. A failure is logged, never shown to the user who sent the feedback, and doesn't stop the other recipients.
export async function feedbackMail(ctx: Ctx, onderwerp: string, tekst: string): Promise<void> {
  for (const aan of ctx.config.feedbackAan) {
    try {
      await ctx.mailer.verstuur({ aan, onderwerp, tekst });
    } catch (e) {
      log.error(`melding niet verstuurd aan ${aan}: ${onderwerp}`, e);
    }
  }
}

// An in-app melding under the bell for the dossier's eigenaar. The bell shows "{current address}: {titel}" on at most two lines, cut off when longer, so the titel leads with what happened. A soort the dossier page doesn't show otherwise also gets its full titel at the top of that page.
export function dossierMelding(ctx: Ctx, d: Dossier, soort: NotificatieSoort, titel: string): void {
  ctx.db.prepare('INSERT INTO notificaties (gebruiker_id, dossier_id, soort, titel, created_at) VALUES (?, ?, ?, ?, ?)').run(d.eigenaar_id, d.id, soort, titel, ctx.klok.iso());
}

export function dossierLink(ctx: Ctx, id: number): string {
  return `${ctx.config.basisUrl}/dossiers/${id}`;
}
