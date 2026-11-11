// The Uitvoeringsspecificatie: what the administratie needs to make the factuur. The app never makes the factuur itself.
import { BTW_PROCENT, KLUSSENDIENST_PER_REGENPIJP_CENT } from './constants.ts';
import { euro, kortDatum } from './datum.ts';
import { getal, kaartItems } from './kaart.ts';
import { eigenaar, str, straatNummer } from './status.ts';
import type { Dossier } from './types.ts';
import { materiaalRijen } from './velden.ts';

export interface SpecificatieRegel {
  naam: string;
  aantal: number;
  prijs: number | null; // cents, excl. btw
  bedrag: number | null;
}

export interface Specificatie {
  regels: SpecificatieRegel[];
  klussendienst: { pijpen: number; bedrag: number };
  subtotaal: number;
  btw: number;
  totaal: number;
  waarschuwingen: string[];
}

// Why there is no specificatie for this dossier, or null when there is one.
export function geenSpecificatie(d: Dossier): string | null {
  if (!d.werk_opgeleverd_at) return 'Beschikbaar zodra de uitvoerder "Werk opgeleverd" heeft aangetikt.';
  if (d.huur_koop === 'koop' && !d.klussendienst_gekozen_at) return 'Niet van toepassing: de bewoner heeft niet voor de Klussendienst gekozen.';
  if (d.huur_koop === null || !d.adres) return 'Vul eerst het adres en huur/koop in bij de Inschrijving.';
  return null;
}

// Gebruikte materialen without an Aantal weren't used. All prices are excl. btw; the btw is taken once, over the subtotaal.
export function specificatie(d: Dossier): Specificatie {
  const waarschuwingen: string[] = [];
  const regels = materiaalRijen(d, 'gebruikt')
    .filter((r) => r.aantal !== null && r.aantal !== 0)
    .map((r) => {
      const naam = r.naam.trim() || 'Materiaal zonder naam';
      if (!r.naam.trim()) waarschuwingen.push('Een gebruikt materiaal heeft geen naam.');
      if (r.prijs === null) waarschuwingen.push(`${naam} heeft geen prijs; telt niet mee in het totaal.`);
      return { naam, aantal: r.aantal!, prijs: r.prijs, bedrag: r.prijs === null ? null : Math.round(r.prijs * r.aantal!) };
    });
  // The Klussendienst counts for huur and koop alike.
  const klussendienst = klussendienstKosten(d);
  if (klussendienst.pijpen === 0) waarschuwingen.push('Geen enkele regenpijp staat op "Afkoppelen: Ja" bij het Bezoek, dus de Klussendienst telt als € 0.');
  const subtotaal = regels.reduce((s, r) => s + (r.bedrag ?? 0), 0) + klussendienst.bedrag;
  const btw = btwOver(subtotaal);
  return { regels, klussendienst, subtotaal, btw, totaal: subtotaal + btw, waarschuwingen };
}

// The Plan's Kosteninschatting uses this too, so both documents name the same Klussendienst price.
export function klussendienstKosten(d: Dossier): { pijpen: number; bedrag: number } {
  const pijpen = kaartItems(d).regenpijpen.filter((p) => str(d, `regenpijp.${p.id}.afkoppelen`) === 'ja').length;
  return { pijpen, bedrag: pijpen * KLUSSENDIENST_PER_REGENPIJP_CENT };
}

export const btwOver = (cent: number): number => Math.round((cent * BTW_PROCENT) / 100);

// Every detail labelled: the factuur may go to the gemeente for the subsidie rather than to the bewoner.
export function specificatieKop(d: Dossier, uitvoerder: string | null): [string, string | null][] {
  const a = d.adres!;
  return [
    ['Project', `Klimaatadaptatie ${a.gemeente}`],
    ['Bewoner', str(d, 'bewoner_naam')],
    ['Adres', `${straatNummer(a)}, ${a.postcode} ${a.plaats}`],
    ['E-mail bewoner', str(d, 'bewoner_email')],
    ['Woningeigenaar', eigenaar(d)],
    ['Uitvoerder', uitvoerder],
    ['Opgeleverd op', kortDatum(d.werk_opgeleverd_at!)],
  ];
}

export function klussendienstRegel(k: { pijpen: number }): string {
  return `Klussendienst: ${k.pijpen} ${k.pijpen === 1 ? 'regenpijp' : 'regenpijpen'} afgekoppeld × ${euro(KLUSSENDIENST_PER_REGENPIJP_CENT)}`;
}

// Plain text to paste into an email to the administratie. No column alignment: a proportional font would undo it.
export function specificatieTekst(d: Dossier, uitvoerder: string | null): string {
  const s = specificatie(d);
  const regel = (r: SpecificatieRegel) => `${getal(r.aantal)} × ${r.naam}${r.prijs === null ? '' : ` à ${euro(r.prijs)}`}: ${r.bedrag === null ? 'prijs ontbreekt' : euro(r.bedrag)}`;
  const blokken = [
    ['Uitvoeringsspecificatie'],
    specificatieKop(d, uitvoerder).map(([l, v]) => `${l}: ${v ?? '--'}`),
    [...s.regels.map(regel), `${klussendienstRegel(s.klussendienst)}: ${euro(s.klussendienst.bedrag)}`],
    [`Subtotaal: ${euro(s.subtotaal)}`, `btw ${BTW_PROCENT}%: ${euro(s.btw)}`, `Totaal: ${euro(s.totaal)}`],
    s.waarschuwingen.map((w) => `LET OP: ${w}`),
  ];
  return blokken.filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n');
}
