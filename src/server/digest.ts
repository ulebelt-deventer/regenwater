import { aandacht, type Soort } from '../shared/aandacht.ts';
import { NORM_CONTROLE_DAGEN, NORM_STANDAARD_LABEL } from '../shared/constants.ts';
import { dagenSinds, datum } from '../shared/datum.ts';
import { adresRegel } from '../shared/status.ts';
import type { Ctx } from './context.ts';
import { dossierLink, melding } from './meldingen.ts';
import { gebruikersMap, laadDossiers, normafvoeren } from './repo.ts';

const KOPPEN: [Soort, string][] = [
  ['klopt_niet', 'Klopt niet'],
  ['plan_gewijzigd', 'Plan gewijzigd'],
  ['ligt_stil', 'Ligt stil'],
];
const STIL_DAGEN = 7;

function normBlok(ctx: Ctx, nu: Date): string | null {
  const oud = normafvoeren(ctx.db).filter((n) => dagenSinds(n.gecontroleerd_at, nu) >= NORM_CONTROLE_DAGEN);
  if (!oud.length) return null;
  const regels = oud.map((n) => `- ${n.gemeente ?? NORM_STANDAARD_LABEL}: ${n.mm} mm, laatst nagekeken op ${datum(n.gecontroleerd_at)}`);
  return `Normafvoer nakijken\n\nKijk na of deze normen nog kloppen: ${ctx.config.basisUrl}/beheer/normafvoer\n\n${regels.join('\n')}`;
}

// The weekly "Aandacht nodig" mail: every open dossier with a finding that isn't snoozed, and any norm due for a yearly check. Returns the text, or null when there is nothing to report.
export function digestTekst(ctx: Ctx): { onderwerp: string; tekst: string } | null {
  const nu = ctx.klok.nu();
  const gm = gebruikersMap(ctx.db);
  const lijst = laadDossiers(ctx.db, 'd.gesloten_at IS NULL')
    .map((d) => ({ d, bevindingen: aandacht(d, gm, nu).bevindingen.filter((b) => !b.uitgesteld) }))
    .filter((x) => x.bevindingen.length > 0);
  const norm = normBlok(ctx, nu);
  if (lijst.length === 0 && norm === null) return null;
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
  if (norm !== null) blokken.push(norm);
  return { onderwerp: lijst.length ? `Aandacht nodig: ${lijst.length} dossiers` : 'Aandacht nodig: normafvoer nakijken', tekst: blokken.join('\n\n\n') };
}

export async function verstuurDigest(ctx: Ctx): Promise<boolean> {
  const m = digestTekst(ctx);
  if (!m) return false;
  await melding(ctx, 'digest', m.onderwerp, m.tekst, null);
  return true;
}
