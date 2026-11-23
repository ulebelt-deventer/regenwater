import type { Ontvanger } from './types.ts';

export type Bijlage = 'plan' | 'opleverrapport';

export interface SjabloonDef {
  key: string;
  naam: string;
  ontvanger: Ontvanger | null; // null: the Signal oproep, copied to the clipboard
  tags: string[];
  verplicht: string[];
  bijlage: Bijlage | null;
  onderwerp: string; // default, seeded into the database
  tekst: string;
}

const GROET = '\n\nMet vriendelijke groet,\n{afzender}\nDe Ulebelt';

export const SJABLONEN: SjabloonDef[] = [
  {
    key: 'subsidie_huur', naam: 'Subsidie: subsidiabel, huurwoning', ontvanger: 'bewoner', bijlage: null,
    tags: ['bewoner', 'adres', 'corporatie', 'afzender', 'subsidie_info'], verplicht: ['subsidie_info'],
    onderwerp: 'Uw aanmelding: we komen graag langs',
    tekst: `Beste {bewoner},\n\nBedankt voor uw aanmelding voor het afkoppelen van regenwater op {adres}. Goed nieuws: uw woning komt in aanmerking.\n\nEen van onze vrijwilligers neemt binnenkort contact met u op om een afspraak te maken. Na het bezoek vragen wij toestemming aan {corporatie}.\n\nMeer informatie over de subsidie: {subsidie_info}${GROET}`,
  },
  {
    key: 'subsidie_koop', naam: 'Subsidie: subsidiabel, koopwoning', ontvanger: 'bewoner', bijlage: null,
    tags: ['bewoner', 'adres', 'afzender', 'subsidie_info'], verplicht: ['subsidie_info'],
    onderwerp: 'Uw aanmelding: we komen graag langs',
    tekst: `Beste {bewoner},\n\nBedankt voor uw aanmelding voor het afkoppelen van regenwater op {adres}. Goed nieuws: uw woning komt in aanmerking voor subsidie.\n\nEen van onze vrijwilligers neemt binnenkort contact met u op voor een bezoek. Alvast meer informatie over de subsidie: {subsidie_info}${GROET}`,
  },
  {
    key: 'subsidie_niet', naam: 'Subsidie: niet subsidiabel', ontvanger: 'bewoner', bijlage: null,
    tags: ['bewoner', 'adres', 'afzender', 'subsidie_info'], verplicht: ['subsidie_info'],
    onderwerp: 'Uw aanmelding bij De Ulebelt',
    tekst: `Beste {bewoner},\n\nBedankt voor uw aanmelding voor het afkoppelen van regenwater op {adres}.\n\nUw woning is al aangesloten op een gescheiden rioolstelsel: het regenwater gaat daar al apart van het afvalwater. Daarom komt u helaas niet in aanmerking voor de subsidie.\n\nOp {subsidie_info} vindt u wel tips om zelf regenwater op te vangen.${GROET}`,
  },
  {
    key: 'bezoeker_toegewezen', naam: 'Bezoeker toegewezen', ontvanger: 'bezoeker', bijlage: null,
    tags: ['bezoeker', 'adres', 'afzender', 'link'], verplicht: ['link'],
    onderwerp: 'Nieuw adres voor je: {adres}',
    tekst: 'Hoi {bezoeker},\n\nFijn dat je {adres} oppakt. Via deze link zie je de contactgegevens van de bewoner en vul je het bezoekformulier in:\n{link}\n\nWil je zelf een afspraak maken met de bewoner en de datum in het dossier zetten?\n\nGroet,\n{afzender}',
  },
  {
    key: 'plan_bewoner_huur', naam: 'Plan naar bewoner (huur)', ontvanger: 'bewoner', bijlage: 'plan',
    tags: ['bewoner', 'adres', 'corporatie', 'afzender'], verplicht: [],
    onderwerp: 'Plan van Aanpak regenwater {adres}',
    tekst: `Beste {bewoner},\n\nIn de bijlage vindt u het Plan van Aanpak dat we samen tijdens het bezoek hebben besproken. We hebben het ook naar {corporatie} gestuurd met het verzoek om toestemming. Zodra we antwoord hebben, hoort u van ons.${GROET}`,
  },
  {
    key: 'plan_bewoner_koop', naam: 'Plan naar bewoner (koop, Klussendienst of zelf)', ontvanger: 'bewoner', bijlage: 'plan',
    tags: ['bewoner', 'adres', 'afzender'], verplicht: [],
    onderwerp: 'Plan van Aanpak regenwater {adres}',
    tekst: `Beste {bewoner},\n\nIn de bijlage vindt u het Plan van Aanpak voor uw woning. U kunt het zelf uitvoeren, of de Klussendienst van De Ulebelt inschakelen. Laat u ons weten wat u kiest?${GROET}`,
  },
  {
    key: 'plan_corporatie', naam: 'Plan naar woningcorporatie', ontvanger: 'corporatie', bijlage: 'plan',
    tags: ['corporatie', 'adres', 'afzender'], verplicht: [],
    onderwerp: 'Verzoek toestemming afkoppeling {adres}',
    tekst: `Beste collega van {corporatie},\n\nIn de bijlage vindt u het Plan van Aanpak voor het afkoppelen van regenwater op {adres}. De bewoner heeft aangegeven dit graag te willen. Graag horen wij of wij dit zo mogen uitvoeren.${GROET}`,
  },
  {
    key: 'uitvoerder_toegewezen', naam: 'Uitvoerder toegewezen', ontvanger: 'uitvoerder', bijlage: 'plan',
    tags: ['uitvoerder', 'adres', 'afzender', 'link'], verplicht: ['link'],
    onderwerp: 'Uitvoering regenwater: {adres}',
    tekst: 'Hoi {uitvoerder},\n\nFijn dat je de uitvoering op {adres} oppakt. In de bijlage staat het Plan van Aanpak. Via deze link zie je de contactgegevens van de bewoner en vul je na afloop in wat er is gedaan:\n{link}\n\nWil je zelf een afspraak maken met de bewoner en de datum in het dossier zetten?\n\nGroet,\n{afzender}',
  },
  {
    key: 'oplever_corporatie', naam: 'Opleverrapport naar woningcorporatie', ontvanger: 'corporatie', bijlage: 'opleverrapport',
    tags: ['corporatie', 'adres', 'afzender'], verplicht: [],
    onderwerp: 'Opleverrapport afkoppeling {adres}',
    tekst: `Beste collega van {corporatie},\n\nDe afkoppeling van het regenwater op {adres} is uitgevoerd. In de bijlage vindt u het opleverrapport, met foto's van het resultaat.${GROET}`,
  },
  {
    key: 'oplever_bewoner', naam: 'Opleverrapport naar bewoner', ontvanger: 'bewoner', bijlage: 'opleverrapport',
    tags: ['bewoner', 'adres', 'afzender'], verplicht: [],
    onderwerp: 'Opleverrapport regenwater {adres}',
    tekst: `Beste {bewoner},\n\nHet werk aan de regenwaterafvoer op {adres} is klaar. In de bijlage vindt u het opleverrapport. Bedankt dat u meedoet!${GROET}`,
  },
  {
    key: 'oproep_signal', naam: 'Oproep Signal-groep', ontvanger: null, bijlage: null,
    tags: ['straat', 'plaats', 'afzender'], verplicht: [],
    onderwerp: '',
    tekst: 'Nieuwe klus voor regenwater-infiltratie in de {straat} in {plaats}. Wie wil er op bezoek? Reageer hier of app {afzender}.',
  },
];

export function sjabloonDef(key: string): SjabloonDef {
  const s = SJABLONEN.find((x) => x.key === key);
  if (!s) throw new Error(`Onbekend sjabloon: ${key}`);
  return s;
}

export const TAG_UITLEG: Record<string, string> = {
  bewoner: 'naam van de bewoner',
  adres: 'adres van de woning',
  corporatie: 'naam van de woningcorporatie',
  bezoeker: 'naam van de bezoeker',
  uitvoerder: 'naam van de uitvoerder',
  afzender: 'jouw naam',
  link: 'link naar het dossier',
  straat: 'straatnaam (zonder huisnummer)',
  plaats: 'plaats',
  subsidie_info: 'link naar de subsidiepagina van de gemeente',
};

export function gebruikteTags(s: string): string[] {
  return [...s.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
}

export interface TagProblemen {
  onbekend: string[];
  ontbrekend: string[];
}

export function controleerTags(def: SjabloonDef, onderwerp: string, tekst: string): TagProblemen {
  const gebruikt = [...gebruikteTags(onderwerp), ...gebruikteTags(tekst)];
  return {
    onbekend: [...new Set(gebruikt.filter((t) => !def.tags.includes(t)))],
    ontbrekend: def.verplicht.filter((t) => !gebruikt.includes(t)),
  };
}

export function probleemTeksten(p: TagProblemen): string[] {
  return [...p.onbekend.map((t) => `{${t}} is geen bekende tag voor deze e-mail.`), ...p.ontbrekend.map((t) => `{${t}} ontbreekt, maar is nodig.`)];
}

// The required tags with no value for this dossier, or whose value no longer appears in an already filled-in mail, eg the dossier link deleted from the text.
export function ontbrekendeWaarden(def: SjabloonDef, waarden: Record<string, string>, onderwerp: string, tekst: string): string[] {
  return def.verplicht.filter((t) => !waarden[t] || !`${onderwerp}\n${tekst}`.includes(waarden[t]));
}

export function vulIn(s: string, waarden: Record<string, string>): string {
  return s.replace(/\{([a-z_]+)\}/g, (m, t: string) => (Object.hasOwn(waarden, t) ? waarden[t] : m));
}
