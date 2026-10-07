import { aandacht, type Soort } from '../shared/aandacht.ts';
import { dagenSinds, datum } from '../shared/datum.ts';
import { adresRegel } from '../shared/status.ts';
import type { Ctx } from './context.ts';
import { dossierLink, melding } from './meldingen.ts';
import { gebruikersMap, laadDossiers } from './repo.ts';

const KOPPEN: [Soort, string][] = [
  ['klopt_niet', 'Klopt niet'],
  ['plan_gewijzigd', 'Plan gewijzigd'],
  ['ligt_stil', 'Ligt stil'],
];
const STIL_DAGEN = 7;

// The weekly "Aandacht nodig" mail: every open dossier with a finding that isn't snoozed. Returns the text, or null when there is nothing to report.
export function digestTekst(ctx: Ctx): { onderwerp: string; tekst: string } | null {
  const nu = ctx.klok.nu();
  const gm = gebruikersMap(ctx.db);
  const lijst = laadDossiers(ctx.db, 'd.gesloten_at IS NULL')
    .map((d) => ({ d, bevindingen: aandacht(d, gm, nu).bevindingen.filter((b) => !b.uitgesteld) }))
    .filter((x) => x.bevindingen.length > 0);
  if (lijst.length === 0) return null;
  const blokken = KOPPEN.flatMap(([soort, kop]) => {
    const regels = lijst.flatMap(({ d, bevindingen }) => {
      const eigen = bevindingen.filter((b) => b.soort === soort);
      if (!eigen.length) return [];
      const laatst = d.laatste_activiteit_at!;
      const stil = dagenSinds(laatst, nu) >= STIL_DAGEN ? `\n  geen activiteit sinds ${datum(laatst)}` : '';
      return [`- ${adresRegel(d)}: ${dossierLink(ctx, d.id)}\n${eigen.map((b) => `  ${b.tekst}`).join('\n')}${stil}`];
    });
    return regels.length ? [`${kop}\n\n${regels.join('\n\n')}`] : [];
  });
  return { onderwerp: `Aandacht nodig: ${lijst.length} dossiers`, tekst: blokken.join('\n\n\n') };
}

export async function verstuurDigest(ctx: Ctx): Promise<boolean> {
  const m = digestTekst(ctx);
  if (!m) return false;
  await melding(ctx, m.onderwerp, m.tekst, null);
  return true;
}
