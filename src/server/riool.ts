// Detects gemengd or gescheiden riool for an address from the gemeente's own public rioolkaart (ArcGIS layers behind the RIOOLKAARTEN viewers).
// Only a hint for the admin: it never sets the rioolstelsel field.
import type { Adres, RioolDetectie, RioolUitslag, Stelsel } from '../shared/types.ts';
import type { Ctx } from './context.ts';

const DEVENTER = 'https://services3.arcgis.com/vIFGkPPowfxZWvaV/arcgis/rest/services/Riool_leidingen_openbaar/FeatureServer/0/query';
const RAALTE = 'https://services-eu1.arcgis.com/2Qr13lRcSlZJ6Qz7/arcgis/rest/services/Afkoppelen_en_subsidiemogelijkheden/FeatureServer/0/query';
const OLST_WIJHE = 'https://services-eu1.arcgis.com/BrFaTyf9OZsDHRgf/arcgis/rest/services/indeling_afkoppeling_hemelwater_ow_view/FeatureServer/0/query';

interface Feature {
  attributes: Record<string, string | number | null>;
  geometry?: { paths: [number, number][][] };
}

// ArcGIS reports most errors as a 200 with an `error` object.
async function query(ctx: Ctx, url: string, rd: [number, number], extra: Record<string, string>): Promise<Feature[]> {
  const p = new URLSearchParams({
    geometry: `${rd[0]},${rd[1]}`, geometryType: 'esriGeometryPoint', inSR: '28992', spatialRel: 'esriSpatialRelIntersects', f: 'json', ...extra,
  });
  const res = await ctx.haal(`${url}?${p}`);
  if (!res.ok) throw new Error(`De rioolkaart van de gemeente gaf een fout (${res.status}).`);
  const r = (await res.json()) as { error?: { code: number }; exceededTransferLimit?: boolean; features: Feature[] };
  if (r.error) throw new Error(`De rioolkaart van de gemeente gaf een fout (${r.error.code}).`);
  if (r.exceededTransferLimit) throw new Error('De rioolkaart van de gemeente gaf niet alle leidingen.');
  return r.features;
}

function afstand(p: [number, number], paden: [number, number][][]): number {
  let min = Infinity;
  for (const pad of paden) {
    for (let i = 0; i + 1 < pad.length; i++) {
      const [[ax, ay], [bx, by]] = [pad[i], pad[i + 1]];
      const [dx, dy] = [bx - ax, by - ay];
      const l = dx * dx + dy * dy;
      const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l));
      min = Math.min(min, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
    }
  }
  return Math.round(min);
}

// Deventer's TypLei values that tell the stelsel; kolken, drains, persleidingen and the like don't.
const AANSLUITING: Record<string, Stelsel> = { 'Gemengde perceelaansluitleiding': 'gemengd', 'DWA perceelaansluitleiding': 'gescheiden', 'HWA perceelaansluitleiding': 'gescheiden' };
const HOOFDRIOOL: Record<string, Stelsel> = { 'Gemengd riool': 'gemengd', Vuilwaterriool: 'gescheiden', Hemelwaterriool: 'gescheiden', Infiltratieriool: 'gescheiden' };
const AANSLUITING_M = 15;
const HOOFDRIOOL_M = 40;
const GELIJK_M = 5; // a gemengd and a gescheiden main this close in distance: too close to call

// The nearest house connection decides; without one, the nearest main in the street.
async function deventer(ctx: Ctx, rd: [number, number]): Promise<RioolUitslag> {
  const lijnen = (await query(ctx, DEVENTER, rd, { distance: String(HOOFDRIOOL_M), units: 'esriSRUnit_Meter', outFields: 'TypLei', returnGeometry: 'true', outSR: '28992' }))
    .map((f) => ({ typ: f.attributes.TypLei as string | null, m: afstand(rd, f.geometry!.paths) }))
    .sort((a, b) => a.m - b.m);
  const aansluiting = lijnen.find((l) => l.typ && AANSLUITING[l.typ] && l.m <= AANSLUITING_M);
  if (aansluiting) return { stelsel: AANSLUITING[aansluiting.typ!], uitleg: `${aansluiting.typ} op ${aansluiting.m} m` };
  const hoofd = lijnen.filter((l) => l.typ && HOOFDRIOOL[l.typ]);
  if (!hoofd.length) return { stelsel: null, uitleg: `Geen riool gevonden binnen ${HOOFDRIOOL_M} m` };
  const [eerste] = hoofd;
  const ander = hoofd.find((l) => HOOFDRIOOL[l.typ!] !== HOOFDRIOOL[eerste.typ!]);
  if (ander && ander.m - eerste.m < GELIJK_M) return { stelsel: null, uitleg: `${eerste.typ} op ${eerste.m} m en ${ander.typ} op ${ander.m} m, geen huisaansluiting gevonden` };
  return { stelsel: HOOFDRIOOL[eerste.typ!], uitleg: `${eerste.typ} op ${eerste.m} m, geen huisaansluiting gevonden` };
}

// One category per pand, in the gemeente's own words; an unknown one fails rather than guessing.
async function perPand(ctx: Ctx, url: string, rd: [number, number], veld: string, labels: Record<string, [Stelsel | null, string]>): Promise<RioolUitslag> {
  const features = await query(ctx, url, rd, { outFields: veld, returnGeometry: 'false' });
  const waarden = [...new Set(features.map((f) => String(f.attributes[veld])))];
  if (waarden.length === 0) return { stelsel: null, uitleg: 'Het pand staat niet op de kaart van de gemeente' };
  const gevonden = waarden.map((w) => {
    if (!labels[w]) throw new Error(`Onbekende categorie op de rioolkaart van de gemeente: ${w}`);
    return labels[w];
  });
  const stelsels = new Set(gevonden.map(([s]) => s));
  return { stelsel: stelsels.size === 1 ? gevonden[0][0] : null, uitleg: gevonden.map(([, l]) => l).join('; ') };
}

const RAALTE_LABELS: Record<string, [Stelsel | null, string]> = Object.fromEntries(
  ([
    ['Subsidie mogelijk - Gemengd riool', 'gemengd'],
    ['Subsidie mogelijk - Gemengd riool, maar risicopand', 'gemengd'],
    ['Geen afkoppelsubsidie mogelijk – Gescheiden riolering of volledig afgekoppeld', 'gescheiden'],
    ['Geen afkoppelsubsidie mogelijk – Buiten de bebouwde kom', null],
  ] as const).map(([l, s]) => [l, [s, l]]),
);

// The legend of Olst-Wijhe's viewer. Here gescheiden can still be subsidiabel (3, 6), so the label always shows.
const OLST_WIJHE_LABELS: Record<string, [Stelsel | null, string]> = {
  1: [null, 'Geen afkoppelsubsidie'],
  2: ['gescheiden', 'Gescheiden opvang regenwater met bergingseis per perceel, geen afkoppelsubsidie'],
  3: ['gescheiden', 'Gescheiden riool, afkoppelsubsidie mogelijk'],
  4: ['gemengd', 'Gemengd riool, subsidie mogelijk'],
  6: [null, 'Toekomstig gescheiden riool, afkoppelsubsidie mogelijk'],
  7: ['gescheiden', 'Regenwater afgekoppeld'],
};

const DETECTIE: Record<string, (ctx: Ctx, rd: [number, number]) => Promise<RioolUitslag>> = {
  Deventer: deventer,
  Raalte: (ctx, rd) => perPand(ctx, RAALTE, rd, 'Categorie', RAALTE_LABELS),
  'Olst-Wijhe': (ctx, rd) => perPand(ctx, OLST_WIJHE, rd, 'hemelwater_gebied', OLST_WIJHE_LABELS),
};

export async function detecteerRiool(ctx: Ctx, a: Adres): Promise<RioolDetectie> {
  const at = ctx.klok.iso();
  const detecteer = DETECTIE[a.gemeente];
  if (!detecteer) return { soort: 'niet_ondersteund', at };
  return { soort: 'gevonden', at, ...(await detecteer(ctx, a.rd)) };
}
