import type { Adres } from '../shared/types.ts';
import type { Ctx } from './context.ts';
import { fout } from './context.ts';

const LOCATIESERVER = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const LUCHTFOTO_WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
const KADASTER_WMS = 'https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0';
const BRO_ZOEK = 'https://publiek.broservices.nl/sr/bhrgt/v2/characteristics/searches';

async function json(ctx: Ctx, url: string): Promise<Record<string, unknown>> {
  const res = await ctx.haal(url);
  if (!res.ok) fout(502, `PDOK gaf een fout (${res.status}). Probeer het later opnieuw.`);
  return (await res.json()) as Record<string, unknown>;
}

type Doc = Record<string, unknown>;
const docs = (r: Record<string, unknown>) => (r.response as { docs: Doc[] }).docs;

export interface Suggestie {
  id: string;
  weergavenaam: string;
}

// `/suggest` while typing; `/free` when suggest finds nothing (eg an unusual spelling).
export async function suggesties(ctx: Ctx, q: string): Promise<Suggestie[]> {
  const p = new URLSearchParams({ q, fq: 'type:adres', rows: '8' });
  let gevonden = docs(await json(ctx, `${LOCATIESERVER}/suggest?${p}`));
  if (gevonden.length === 0) gevonden = docs(await json(ctx, `${LOCATIESERVER}/free?${p}`));
  return gevonden.map((d) => ({ id: d.id as string, weergavenaam: d.weergavenaam as string }));
}

export function punt(wkt: string): [number, number] {
  const m = /POINT\(([\d.-]+) ([\d.-]+)\)/.exec(wkt);
  if (!m) throw new Error(`Onverwacht punt van PDOK: ${wkt}`);
  return [Number(m[1]), Number(m[2])];
}

export function bboxVan(wkt: string): [number, number, number, number] {
  const paren = [...wkt.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (paren.length === 0) throw new Error(`Onverwachte geometrie van PDOK: ${wkt.slice(0, 80)}`);
  const xs = paren.map((p) => p[0]);
  const ys = paren.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

async function perceelBbox(ctx: Ctx, percelen: string[]): Promise<[number, number, number, number] | null> {
  const boxen: [number, number, number, number][] = [];
  for (const perceel of percelen) {
    const p = new URLSearchParams({ q: `identificatie:${perceel}`, fq: 'type:perceel', fl: 'id,identificatie,geometrie_rd', rows: '1' });
    const [doc] = docs(await json(ctx, `${LOCATIESERVER}/free?${p}`));
    if (doc && typeof doc.geometrie_rd === 'string') boxen.push(bboxVan(doc.geometrie_rd));
  }
  if (boxen.length === 0) return null;
  return [Math.min(...boxen.map((b) => b[0])), Math.min(...boxen.map((b) => b[1])), Math.max(...boxen.map((b) => b[2])), Math.max(...boxen.map((b) => b[3]))];
}

export async function zoekAdres(ctx: Ctx, id: string): Promise<Adres> {
  if (!/^adr-[0-9a-f]+$/.test(id)) fout(400, 'Ongeldig adres-ID');
  const [doc] = docs(await json(ctx, `${LOCATIESERVER}/lookup?${new URLSearchParams({ id })}`));
  if (!doc || doc.type !== 'adres') fout(404, 'Adres niet gevonden bij PDOK');
  const percelen = Array.isArray(doc.gekoppeld_perceel) ? (doc.gekoppeld_perceel as string[]) : [];
  return {
    straat: doc.straatnaam as string,
    huisnummer: doc.huisnummer as number,
    huisletter: typeof doc.huisletter === 'string' ? doc.huisletter : '',
    toevoeging: typeof doc.huisnummertoevoeging === 'string' ? doc.huisnummertoevoeging : '',
    postcode: doc.postcode as string,
    plaats: doc.woonplaatsnaam as string,
    gemeente: doc.gemeentenaam as string,
    percelen,
    rd: punt(doc.centroide_rd as string),
    ll: punt(doc.centroide_ll as string),
    perceel_bbox: await perceelBbox(ctx, percelen),
  };
}

export type Bbox = [number, number, number, number];

function wmsUrl(basis: string, lagen: string, bbox: Bbox, w: number, h: number, formaat: string, transparant: boolean): string {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: lagen, STYLES: '', CRS: 'EPSG:28992',
    BBOX: bbox.join(','), WIDTH: String(w), HEIGHT: String(h), FORMAT: formaat,
  });
  if (transparant) p.set('TRANSPARENT', 'true');
  return `${basis}?${p}`;
}

async function plaatje(ctx: Ctx, url: string): Promise<Buffer> {
  const res = await ctx.haal(url);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) fout(502, `De luchtfoto kon niet worden geladen (${res.status}). Probeer het later opnieuw.`);
  return Buffer.from(await res.arrayBuffer());
}

// The aerial photo with the cadastral parcel lines, labels and buildings drawn over it, for exactly this RD box.
export async function luchtfoto(ctx: Ctx, bbox: Bbox, w: number, h: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const [foto, kadaster] = await Promise.all([
    plaatje(ctx, wmsUrl(LUCHTFOTO_WMS, 'Actueel_orthoHR', bbox, w, h, 'image/jpeg', false)),
    plaatje(ctx, wmsUrl(KADASTER_WMS, 'Perceel,KadastraleGrens,Bebouwing,Label', bbox, w, h, 'image/png', true)),
  ]);
  return sharp(foto).composite([{ input: kadaster }]).jpeg({ quality: 85 }).toBuffer();
}

export interface Boring {
  broId: string;
  afstand_m: number;
  url: string;
}

// The nearest BHR-GT boring (geotechnical borehole description), searching wider circles until one is found.
export async function dichtsteBoring(ctx: Ctx, rd: [number, number], ll: [number, number]): Promise<Boring | null> {
  const vandaag = ctx.klok.iso().slice(0, 10);
  for (const km of [0.5, 2, 5]) {
    const res = await ctx.haal(BRO_ZOEK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/xml' },
      body: JSON.stringify({
        registrationPeriod: { beginDate: '1900-01-01', endDate: vandaag },
        area: { enclosingCircle: { center: { lat: ll[1], lon: ll[0] }, radius: km } },
      }),
    });
    if (!res.ok) fout(502, `BRO gaf een fout (${res.status}). Probeer het later opnieuw.`);
    const xml = await res.text();
    const boringen = [...xml.matchAll(/<brocom:broId>([^<]+)<\/brocom:broId>[\s\S]*?<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>/g)].map((m) => ({
      broId: m[1],
      afstand_m: Math.round(Math.hypot(Number(m[2]) - rd[0], Number(m[3]) - rd[1])),
    }));
    if (boringen.length) {
      const b = boringen.sort((x, y) => x.afstand_m - y.afstand_m)[0];
      return { ...b, url: `https://www.broloket.nl/ondergrondgegevens?bro-id=${b.broId}` };
    }
  }
  return null;
}
