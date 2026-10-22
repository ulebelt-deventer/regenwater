import { CORPORATIES, DOORLAATBAARHEID } from './constants.ts';
import { datum, datumTijd } from './datum.ts';
import { getal, kaartItems } from './kaart.ts';
import type { Dossier, Json } from './types.ts';

export type Pagina = 'inschrijving' | 'details' | 'bezoek' | 'plan' | 'uitvoering';
// Who may edit besides a beheerder. 'bezoeker'/'uitvoerder' means the klusser assigned to that role, until their hand-off.
export type Bewerker = 'bezoeker' | 'uitvoerder';
export type VeldType = 'text' | 'email' | 'tel' | 'textarea' | 'number' | 'radio' | 'checks' | 'verdeling' | 'date' | 'datetime' | 'ids' | 'annotaties';

export interface Veld {
  key: string; // `*` stands for an item id, eg `regenpijp.*.soort`
  label: string;
  type: VeldType;
  pagina: Pagina;
  bewerkers: Bewerker[];
  opties?: [string, string][];
  vervallen?: [string, string][]; // retired options: no longer offered or accepted, but old values still show their label
  lijst?: boolean; // radio or checks shown as a dropdown, to save room
  menu?: boolean; // a radio shown as a Dropdown menu rather than a select, for long option labels
  rijen?: number; // a textarea's height, default 3
  opsomming?: boolean; // a textarea shown as "• " bullets, stored as plain lines without empty ones
  suggesties?: [string, string][]; // lines that links above an opsomming add
  anders?: boolean; // the last option is "Anders, namelijk:" with a write-in stored under `${key}_anders`
  inPlan?: boolean;
  inOplever?: boolean;
  controle?: boolean; // the Controle text lists it while empty
  zichtbaar?: (d: Dossier, id: string | null) => boolean;
  hint?: string;
  fotos?: string; // photo slot shown next to the field
  kolom?: boolean; // stored as a real column, not in the JSON data
  min?: number;
  max?: number;
}

export interface FotoSlot {
  key: string; // `*` stands for an item id
  label: string;
  pagina: Pagina;
  bewerkers: Bewerker[];
  inPlan?: boolean;
  inOplever?: boolean;
  enkel?: boolean; // a single-photo slot: a new photo goes in only once the old one is deleted
  heel?: boolean; // its thumbnail shows the whole image, large, at its own aspect ratio
}

const isHuur = (d: Dossier) => d.huur_koop === 'huur';
const regenpijpWaarde = (d: Dossier, id: string | null, veld: string) => d.data[`regenpijp.${id}.${veld}`];

export const BEOORDELINGEN: [string, string, string][] = [
  ['uitvoerbaar', 'Wensen uitvoerbaar', 'De Ulebelt is positief over de wensen van de bewoner en denkt dat ze uitvoerbaar zijn.'],
  ['aanpassingen', 'Uitvoerbaar met aanpassingen', 'De Ulebelt is positief over de wensen van de bewoner en denkt dat ze uitvoerbaar zijn, met de volgende aanpassingen.'],
  ['deels', 'Deels uitvoerbaar', 'De Ulebelt denkt dat de wensen van de bewoner deels uitvoerbaar zijn.'],
  ['niet', 'Niet uitvoerbaar', 'De Ulebelt denkt helaas dat de wensen van de bewoner niet uitvoerbaar zijn.'],
];

export const VELDEN: Veld[] = [
  // Inschrijving
  { key: 'bewoner_naam', label: 'Naam bewoner', type: 'text', pagina: 'inschrijving', bewerkers: [], inPlan: true, inOplever: true },
  { key: 'bewoner_email', label: 'E-mail bewoner', type: 'email', pagina: 'inschrijving', bewerkers: [] },
  { key: 'bewoner_telefoon', label: 'Telefoon bewoner', type: 'tel', pagina: 'inschrijving', bewerkers: [] },
  { key: 'huur_koop', label: 'Huurwoning of koopwoning', type: 'radio', pagina: 'inschrijving', bewerkers: [], kolom: true, inPlan: true, inOplever: true, opties: [['huur', 'Huurwoning'], ['koop', 'Koopwoning']] },
  { key: 'woningeigenaar', label: 'Woningeigenaar', type: 'radio', lijst: true, pagina: 'inschrijving', bewerkers: [], inPlan: true, inOplever: true, anders: true, zichtbaar: isHuur, opties: [...CORPORATIES.map((c): [string, string] => [c, c]), ['anders', 'Anders, namelijk:']] },
  {
    key: 'woningtype', label: 'Woningtype', type: 'radio', lijst: true, pagina: 'inschrijving', bewerkers: [], inPlan: true, anders: true,
    opties: [['tussenwoning', 'Tussenwoning'], ['hoekwoning', 'Hoekwoning'], ['geschakeld', 'Geschakeld'], ['2-onder-1-kap', '2-onder-1-kap'], ['vrijstaand', 'Vrijstaand'], ['benedenwoning', 'Benedenwoning'], ['anders', 'Anders, namelijk:']],
  },
  { key: 'rioolstelsel', label: 'Rioolstelsel', type: 'radio', pagina: 'inschrijving', bewerkers: [], opties: [['gemengd', 'Gemengd'], ['gescheiden', 'Gescheiden']] },
  { key: 'boorlocatie', label: 'Boorlocatie', type: 'textarea', rijen: 2, pagina: 'inschrijving', bewerkers: [], inPlan: true, hint: 'Waar de boring is gedaan, bijvoorbeeld "Voorbeeldplein, Deventer".' },
  {
    key: 'bodemsituatie', label: 'Bodemsituatie', type: 'radio', menu: true, pagina: 'inschrijving', bewerkers: [], inPlan: true, anders: true,
    opties: [
      ...DOORLAATBAARHEID.map(([k, grond, doorlaat]): [string, string] => [k, `${grond} (${doorlaat.toLowerCase()} doorlaatbaar)`]),
      ['anders', 'Anders, namelijk:'],
    ],
    vervallen: [
      ['zand_fijn', 'Zand, fijn tot midden, goed doorlaatbaar'],
      ['zand_grof', 'Zand, grof, zeer goed doorlaatbaar'],
      ['zand_lemig', 'Lemig of siltig zand, matig doorlaatbaar'],
    ],
  },
  { key: 'kaart_annotaties', label: 'Tekeningen op de kaart', type: 'annotaties', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },

  // Details page, inline
  { key: 'notities', label: 'Notities', type: 'textarea', pagina: 'details', bewerkers: ['bezoeker', 'uitvoerder'] },
  { key: 'afspraak', label: 'Bezoek-afspraak', type: 'datetime', pagina: 'details', bewerkers: ['bezoeker'], kolom: true, inPlan: true },
  { key: 'uitvoering_gepland', label: 'Uitvoering gepland op', type: 'date', pagina: 'details', bewerkers: ['uitvoerder'], kolom: true },

  // Bezoek
  { key: 'dak.*.m2', label: 'Dak m²', type: 'number', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, min: 0 },
  // `{ pijpId: pct }` set by hand; null follows the kaart (see kaartItems)
  { key: 'dak.*.verdeling', label: 'Regenpijpen', type: 'verdeling', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'tuin.*.m2', label: 'Tuin m²', type: 'number', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, min: 0 },
  { key: 'steen.*.m2', label: 'Steen m²', type: 'number', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, min: 0 },
  { key: 'tuinsituatie', label: 'Tuinsituatie & infiltratie', type: 'textarea', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, fotos: 'tuinsituatie', hint: 'Is de tuin groot en groen genoeg om het water te laten infiltreren, ook bij piekafvoer? Welke obstakels zijn er (terras, pad, hoogteverschil)? Is er een wadi nodig?' },
  { key: 'regenpijp.*.soort', label: 'Soort', type: 'radio', lijst: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, anders: true, opties: [['pvc', 'PVC'], ['zink', 'Zink'], ['anders', 'Anders, namelijk:']] },
  { key: 'regenpijp.*.diameter', label: 'Diameter', type: 'radio', lijst: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, anders: true, opties: [['80', '80 mm'], ['100', '100 mm'], ['anders', 'Anders, namelijk:']] },
  { key: 'regenpijp.*.regenton', label: 'Regenton aanwezig?', type: 'radio', lijst: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, opties: [['aanwezig', 'Is al aanwezig'], ['gewenst', 'Niet aanwezig, wel gewenst'], ['niet', 'Niet gewenst']] },
  { key: 'regenpijp.*.ondergrond', label: 'Hoe is de ondergrond bij de pijp?', type: 'textarea', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, fotos: 'regenpijp.*.ondergrond', zichtbaar: (d, id) => regenpijpWaarde(d, id, 'regenton') === 'gewenst' },
  { key: 'regenpijp.*.afkoppelen', label: 'Afkoppelen?', type: 'radio', lijst: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, opties: [['ja', 'Ja'], ['nee', 'Nee (blijft naar riool gaan)'], ['twijfel', 'Twijfel']] },
  { key: 'regenpijp.*.waar', label: 'Waar moet het water naartoe?', type: 'textarea', rijen: 2, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, fotos: 'regenpijp.*.waar' },
  { key: 'regenpijp.*.hoe', label: 'Hoe moet het water daarnaartoe komen?', type: 'checks', lijst: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, anders: true, fotos: 'regenpijp.*.hoe', opties: [['holie_molie', 'Holie Molie'], ['drainageslang', 'Drainageslang bovengronds'], ['ondergronds', 'Ondergronds'], ['anders', 'Anders, namelijk:']] },
  { key: 'hoosbuien', label: 'Wat gebeurt er bij hoosbuien?', type: 'textarea', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, fotos: 'hoosbuien', hint: 'Kijk en vraag. Waar loopt het dan naar toe? Kan het naar de straat waar een put zit? Of naar een gemeenteplantsoen dat aan de tuin grenst? Let goed op bij hoogteverschillen!' },
  { key: 'wensen', label: 'Wat wenst de bewoner?', type: 'textarea', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, controle: true, hint: 'Wat wil de bewoner bereiken? Regenton(nen) plaatsen? Regenpijp afkoppelen? Water de tuin in laten lopen? Wat wil de bewoner zelf doen?' },
  { key: 'bewoner_doet', label: 'Wat gaat de bewoner doen?', type: 'textarea', opsomming: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, suggesties: [['opruimen', 'Tuin opruimen op plek regenton'], ['steen', 'Steen van 60x60 regelen voor onder regenton'], ['buren', 'Overleggen met de buren (bij gedeelde regenpijp)']] },
  { key: 'ulebelt_doet', label: 'Wat gaat De Ulebelt doen?', type: 'textarea', opsomming: true, pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, suggesties: [['afkoppelen', 'Regenpijp afkoppelen'], ['holie_molie', 'Holie Molie plaatsen'], ['drainageslang', 'Drainageslang aanleggen'], ['toestemming', 'Toestemming aan woningcorporatie vragen']] },

  // Plan van Aanpak
  { key: 'beoordeling', label: 'Beoordeling', type: 'radio', pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true, controle: true, opties: BEOORDELINGEN.map(([k, l]): [string, string] => [k, l]) },
  { key: 'beoordeling_toelichting', label: 'Toelichting', type: 'textarea', pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'voorstel', label: 'Voorgestelde werkzaamheden', type: 'textarea', opsomming: true, pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true, controle: true, hint: 'De Ulebelt stelt de volgende werkzaamheden voor:', suggesties: [['regenton', 'Regenton plaatsen op een steen van 60x60'], ['afzagen', 'Regenpijp afzagen en het restant afdoppen'], ['drainageslang', 'Drainageslang aanleggen naar de tuin']] },
  { key: 'materialen', label: 'Materialen die nodig zijn', type: 'ids', pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'materiaal.*.naam', label: 'Materiaal', type: 'text', pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'materiaal.*.prijs', label: 'Prijs', type: 'number', pagina: 'plan', bewerkers: ['bezoeker'], min: 0 },
  { key: 'materiaal.*.aantal', label: 'Aantal', type: 'number', pagina: 'plan', bewerkers: ['bezoeker'], inPlan: true, min: 0 },
  // Uitvoering
  { key: 'uitgevoerd', label: 'Wat is er uitgevoerd?', type: 'textarea', pagina: 'uitvoering', bewerkers: ['uitvoerder'], inOplever: true, hint: 'Beschrijf wat er gedaan is en wat er anders ging dan in het plan. Dit komt in het opleverrapport voor de bewoner en de woningcorporatie.' },
  { key: 'gebruikt', label: 'Gebruikte materialen', type: 'ids', pagina: 'uitvoering', bewerkers: ['uitvoerder'], inOplever: true },
  { key: 'gebruikt.*.naam', label: 'Materiaal', type: 'text', pagina: 'uitvoering', bewerkers: ['uitvoerder'], inOplever: true },
  { key: 'gebruikt.*.prijs', label: 'Prijs', type: 'number', pagina: 'uitvoering', bewerkers: ['uitvoerder'], min: 0 },
  { key: 'gebruikt.*.aantal', label: 'Aantal', type: 'number', pagina: 'uitvoering', bewerkers: ['uitvoerder'], inOplever: true, min: 0 },
];

// A tuin's or steen's photos and the kaart sit next to Inschrijving/Bezoek fields; the kaart is shared by both pages.
export const FOTO_SLOTS: FotoSlot[] = [
  { key: 'straatfoto', label: 'Straatfoto', pagina: 'inschrijving', bewerkers: [], inPlan: true, enkel: true, heel: true },
  { key: 'kaart', label: 'Plattegrond', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true, enkel: true, heel: true },
  { key: 'boorprofiel', label: 'Boorprofiel', pagina: 'inschrijving', bewerkers: [], inPlan: true, enkel: true, heel: true },
  { key: 'tuin.*', label: 'Foto’s van de tuin', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'steen.*', label: 'Foto’s van het stenen vlak', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'tuinsituatie', label: 'Foto’s tuinsituatie', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'regenpijp.*.ondergrond', label: 'Foto’s ondergrond', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'regenpijp.*.waar', label: 'Foto’s waar het water heen moet', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'regenpijp.*.hoe', label: 'Foto’s hoe het water er moet komen', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'hoosbuien', label: 'Foto’s hoosbuien', pagina: 'bezoek', bewerkers: ['bezoeker'], inPlan: true },
  { key: 'opleverfotos', label: 'Opleverfoto’s', pagina: 'uitvoering', bewerkers: ['uitvoerder'], inOplever: true },
];

export const ITEM_ID = /^[a-z0-9]{1,24}$/;

// Stable ID for a repeating item (dak, regenpijp, materiaal row...), unique enough within one dossier.
export function nieuwId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

function patroon(key: string): { patroon: string; id: string | null } {
  const delen = key.split('.');
  if (delen.length === 3 && ITEM_ID.test(delen[1])) return { patroon: `${delen[0]}.*.${delen[2]}`, id: delen[1] };
  if (delen.length === 2 && ITEM_ID.test(delen[1])) return { patroon: `${delen[0]}.*`, id: delen[1] };
  return { patroon: key, id: null };
}

// Resolves a concrete key (eg `regenpijp.k3x9.soort` or `woningtype_anders`) to its definition.
export function veldVoor(key: string): { veld: Veld; id: string | null; anders: boolean } | null {
  const anders = key.endsWith('_anders');
  const basis = anders ? key.slice(0, -'_anders'.length) : key;
  const { patroon: p, id } = patroon(basis);
  const veld = VELDEN.find((v) => v.key === p);
  if (!veld || (anders && !veld.anders)) return null;
  return { veld, id, anders };
}

export function fotoSlotVoor(key: string): { slot: FotoSlot; id: string | null } | null {
  const { patroon: p, id } = patroon(key);
  const slot = FOTO_SLOTS.find((s) => s.key === p);
  return slot ? { slot, id } : null;
}

export function veld(key: string): Veld {
  const v = VELDEN.find((x) => x.key === key);
  if (!v) throw new Error(`Onbekend veld: ${key}`);
  return v;
}

export function waarde(d: Dossier, key: string): Json {
  if (key === 'huur_koop') return d.huur_koop;
  if (key === 'afspraak') return d.afspraak;
  if (key === 'uitvoering_gepland') return d.uitvoering_gepland;
  const v = d.data[key];
  return v === undefined ? null : v;
}

export function isLeeg(v: Json): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.trim() === '');
}

// An option's label, also for a retired one.
export function optieTekst(veldDef: Veld, w: string, key: string): string {
  const o = [...veldDef.opties!, ...(veldDef.vervallen ?? [])].find(([k]) => k === w);
  if (!o) throw new Error(`Onbekende optie ${w} voor ${key}`);
  return o[1];
}

export function optieLabel(veldDef: Veld, d: Dossier, key: string): string | null {
  const v = waarde(d, key);
  if (isLeeg(v)) return null;
  const labelVan = (w: string) => {
    if (veldDef.anders && w === 'anders') {
      const extra = d.data[`${key}_anders`];
      return typeof extra === 'string' && extra.trim() ? extra.trim() : 'Anders';
    }
    return optieTekst(veldDef, w, key);
  };
  if (Array.isArray(v)) return v.map((w) => labelVan(w as string)).join(', ');
  return labelVan(v as string);
}

// A field's value as read-only text for the details page summaries, or null when empty.
export function veldTekst(d: Dossier, key: string): string | null {
  const gevonden = veldVoor(key);
  if (!gevonden) throw new Error(`Onbekend veld: ${key}`);
  const v = gevonden.veld;
  const w = waarde(d, key);
  if (isLeeg(w)) return null;
  switch (v.type) {
    case 'radio':
    case 'checks':
      return optieLabel(v, d, key);
    case 'number':
      return getal(w as number);
    case 'date':
      return datum(w as string);
    case 'datetime':
      return datumTijd(w as string);
    case 'verdeling': // kaartItems knows the effective one, also when none was set by hand
    case 'ids':
    case 'annotaties':
      throw new Error(`${key} heeft geen losse tekstwaarde`);
    default:
      return (w as string).trim();
  }
}

// An opsomming's lines without bullets or empty lines; also cleans up what was typed or pasted.
export function opsommingRegels(t: string): string[] {
  return t.split('\n').map((r) => r.replace(/^\s*•/, '').trim()).filter((r) => r !== '');
}

export function lijst(d: Dossier, key: string): string[] {
  const v = d.data[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

export interface MateriaalRij {
  id: string;
  naam: string;
  prijs: number | null; // cents
  aantal: number | null;
}

export function materiaalRijen(d: Dossier, lijstKey: 'materialen' | 'gebruikt'): MateriaalRij[] {
  const item = lijstKey === 'materialen' ? 'materiaal' : 'gebruikt';
  return lijst(d, lijstKey).map((id) => {
    const naam = d.data[`${item}.${id}.naam`];
    const prijs = d.data[`${item}.${id}.prijs`];
    const aantal = d.data[`${item}.${id}.aantal`];
    return {
      id,
      naam: typeof naam === 'string' ? naam : '',
      prijs: typeof prijs === 'number' ? prijs : null,
      aantal: typeof aantal === 'number' ? aantal : null,
    };
  });
}

export function materiaalTotaal(rijen: MateriaalRij[]): number {
  return rijen.reduce((s, r) => s + (r.prijs !== null && r.aantal !== null ? Math.round(r.prijs * r.aantal) : 0), 0);
}

export interface Ontbrekend {
  label: string;
  anker: string; // element id on the sub-page
}

function veldOntbreekt(d: Dossier, v: Veld, key: string, id: string | null): boolean {
  if (v.zichtbaar && !v.zichtbaar(d, id)) return false;
  const w = waarde(d, key);
  if (isLeeg(w)) return true;
  if (v.anders && (w === 'anders' || (Array.isArray(w) && w.includes('anders')))) return isLeeg(waarde(d, `${key}_anders`));
  return false;
}

// What the Controle text on the Bezoek or Plan van Aanpak sub-page lists as still missing.
export function ontbrekend(d: Dossier, pagina: 'bezoek' | 'plan'): Ontbrekend[] {
  const uit: Ontbrekend[] = [];
  const items = kaartItems(d);
  if (pagina === 'bezoek') {
    if (items.daken.length === 0) uit.push({ label: 'Dak intekenen op de kaart', anker: 'veld-kaart' });
    if (items.tuinen.length === 0) uit.push({ label: 'Tuin intekenen op de kaart', anker: 'veld-kaart' });
    for (const dak of items.daken) {
      if (dak.m2 === null) uit.push({ label: `${dak.label}: m²`, anker: `veld-dak.${dak.id}.m2` });
      if (dak.verlopen) uit.push({ label: `${dak.label}: verdeling opnieuw controleren`, anker: `veld-dak.${dak.id}.verdeling` });
      else if (dak.verdeling.length === 0) uit.push({ label: `${dak.label}: geen regenpijp`, anker: `veld-dak.${dak.id}.verdeling` });
    }
    for (const r of items.regenpijpen) if (r.bronnen.length === 0) uit.push({ label: `Regenpijp ${r.label}: aan geen dak gekoppeld`, anker: `veld-regenpijp.${r.id}.bronnen` });
    for (const tuin of items.tuinen) if (tuin.m2 === null) uit.push({ label: `${tuin.label}: m²`, anker: `veld-tuin.${tuin.id}.m2` });
    for (const steen of items.stenen) if (steen.m2 === null) uit.push({ label: `${steen.label}: m²`, anker: `veld-steen.${steen.id}.m2` });
  }
  for (const v of VELDEN) {
    if (v.pagina !== pagina || !v.controle) continue;
    if (v.key.startsWith('regenpijp.*.')) {
      for (const r of items.regenpijpen) {
        const key = v.key.replace('*', r.id);
        if (veldOntbreekt(d, v, key, r.id)) uit.push({ label: `Regenpijp ${r.label}: ${v.label}`, anker: `veld-${key}` });
      }
    } else if (veldOntbreekt(d, v, v.key, null)) {
      uit.push({ label: v.label, anker: `veld-${v.key}` });
    }
  }
  if (pagina === 'plan') {
    const b = d.data.beoordeling;
    if (typeof b === 'string' && b !== 'uitvoerbaar' && isLeeg(waarde(d, 'beoordeling_toelichting'))) {
      uit.push({ label: 'Toelichting bij de beoordeling', anker: 'veld-beoordeling_toelichting' });
    }
  }
  return uit;
}
