import { BORING_MAX_KM } from '../shared/constants.ts';
import type { Adres } from '../shared/types.ts';
import type { Ctx } from './context.ts';
import { fout } from './context.ts';

const LOCATIESERVER = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const LUCHTFOTO_WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
const KADASTER_WMS = 'https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0';
const BRO_ZOEK = 'https://publiek.broservices.nl/sr/bhrgt/v2/characteristics/searches';
const BRO_OBJECT = 'https://publiek.broservices.nl/sr/bhrgt/v2/objects/';
const BRO_PROFIEL = 'https://publiek.broservices.nl/sr/bhrgt/v2/profile/graph/dispatch?language=nl&asNAP=false';
// Not a documented API: these are what DINOloket's own map uses, found in its /uitgifteloket/api/config/properties.
const DINO_ZOEK = 'https://www.broloket.nl/standalone/rest/services/uitgifteloket_gdn/lks_gbo_rd_v1/MapServer/0/query';
const DINO_PROFIEL = 'https://www.dinoloket.nl/uitgifteloket/api/brh/profile/';

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
  bron: 'BRO' | 'DINO';
  id: string;
  ll: [number, number];
  afstand_m: number;
}

// Metres between two [lon, lat] points; flat-earth is exact enough within the BORING_MAX_KM we search.
function meters(a: [number, number], b: [number, number]): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111_320;
  const dy = (b[1] - a[1]) * 110_574;
  return Math.round(Math.hypot(dx, dy));
}

const broFout = (status: number | string): never => fout(502, `BRO gaf een fout (${status}). Probeer het later opnieuw.`);
const dinoFout = (status: number | string): never => fout(502, `DINOloket gaf een fout (${status}). Probeer het later opnieuw.`);

// BHR-GT: the geotechnical borings registered in BRO. Each one's standardizedLocation is always lat/lon; its deliveredLocation is in whatever system the supplier used, so only the first is read.
async function broBoringen(ctx: Ctx, ll: [number, number], km: number): Promise<Boring[]> {
  const res = await ctx.haal(BRO_ZOEK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/xml' },
    body: JSON.stringify({
      registrationPeriod: { beginDate: '1900-01-01', endDate: ctx.klok.iso().slice(0, 10) },
      area: { enclosingCircle: { center: { lat: ll[1], lon: ll[0] }, radius: km } },
    }),
  });
  if (!res.ok) broFout(res.status);
  return (await res.text())
    .split('<dispatchDocument>')
    .slice(1)
    .map((doc) => {
      const id = /<brocom:broId>([^<]+)<\/brocom:broId>/.exec(doc);
      const pos = /<brocom:standardizedLocation[^>]*>\s*<gml:pos>([\d.-]+) ([\d.-]+)<\/gml:pos>/.exec(doc);
      if (!id || !pos) throw new Error(`Onverwachte boring van BRO: ${doc.slice(0, 200)}`);
      const plek: [number, number] = [Number(pos[2]), Number(pos[1])];
      return { bron: 'BRO', id: id[1], ll: plek, afstand_m: meters(ll, plek) };
    });
}

// DINO's geological borings: TNO's archive, far denser than BRO's own registrations. This is the map layer behind DINOloket, which answers ArcGIS queries; it errors with a 200 and an `error` object.
async function dinoBoringen(ctx: Ctx, ll: [number, number], km: number): Promise<Boring[]> {
  const p = new URLSearchParams({
    geometry: JSON.stringify({ x: ll[0], y: ll[1] }), geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(km * 1000), units: 'esriSRUnit_Meter',
    outFields: 'DINO_NR', returnGeometry: 'true', outSR: '4326', f: 'json',
  });
  const res = await ctx.haal(`${DINO_ZOEK}?${p}`);
  if (!res.ok) dinoFout(res.status);
  const r = (await res.json()) as { error?: { code: number }; exceededTransferLimit?: boolean; features: { attributes: { DINO_NR: string }; geometry: { x: number; y: number } }[] };
  if (r.error) dinoFout(r.error.code);
  if (r.exceededTransferLimit) throw new Error(`DINOloket gaf niet alle boringen binnen ${km} km`);
  return r.features.map((f) => {
    const plek: [number, number] = [f.geometry.x, f.geometry.y];
    return { bron: 'DINO', id: f.attributes.DINO_NR, ll: plek, afstand_m: meters(ll, plek) };
  });
}

// The profile drawing as SVG, or null when the boring has no layer description. BRO draws a boring from its own XML, so that is fetched first.
async function profielSvg(ctx: Ctx, b: Boring): Promise<string | null> {
  if (b.bron === 'DINO') {
    const res = await ctx.haal(`${DINO_PROFIEL}${encodeURIComponent(b.id)}`);
    if (!res.ok) dinoFout(res.status);
    const svg = await res.text();
    if (!svg.includes('<svg')) dinoFout('geen tekening');
    return svg.includes('geen boormonsterbeschrijving') ? null : svg;
  }
  const obj = await ctx.haal(`${BRO_OBJECT}${encodeURIComponent(b.id)}`, { headers: { accept: 'application/xml' } });
  if (!obj.ok) broFout(obj.status);
  const res = await ctx.haal(BRO_PROFIEL, { method: 'POST', headers: { 'content-type': 'application/xml', accept: 'application/svg+xml' }, body: await obj.text() });
  if (!res.ok) broFout(res.status);
  const svg = await res.text();
  if (!svg.includes('<svg')) broFout('geen tekening');
  return svg;
}

// Searches BRO and DINO in wider circles until either holds a boring; within a circle both lists are complete, so the nearest there is the nearest anywhere.
// A DINO boring without a layer description is skipped for the next nearest, up to MAX_ZONDER_BESCHRIJVING of them.
const MAX_ZONDER_BESCHRIJVING = 5;
export async function dichtsteBoring(ctx: Ctx, ll: [number, number]): Promise<(Boring & { png: Buffer }) | null> {
  const { default: sharp } = await import('sharp');
  for (const km of [0.5, BORING_MAX_KM]) {
    const [bro, dino] = await Promise.all([broBoringen(ctx, ll, km), dinoBoringen(ctx, ll, km)]);
    const boringen = [...bro, ...dino].sort((x, y) => x.afstand_m - y.afstand_m);
    if (!boringen.length) continue;
    const kandidaten = boringen.slice(0, MAX_ZONDER_BESCHRIJVING);
    for (const b of kandidaten) {
      const svg = await profielSvg(ctx, b);
      if (svg) return { ...b, png: await sharp(Buffer.from(svg), { density: 150 }).flatten({ background: '#ffffff' }).png().toBuffer() };
    }
    fout(502, `Geen van de ${kandidaten.length} dichtstbijzijnde boringen heeft een beschrijving. Zoek zelf op DINOloket.`);
  }
  return null;
}

// The street nearest a point, as "Straat, Plaats".
export async function straatBij(ctx: Ctx, ll: [number, number]): Promise<string> {
  const p = new URLSearchParams({ lat: String(ll[1]), lon: String(ll[0]), type: 'weg', rows: '1' });
  const [doc] = docs(await json(ctx, `${LOCATIESERVER}/reverse?${p}`));
  if (!doc) fout(502, 'PDOK vond geen straat bij de boring.');
  return doc.weergavenaam as string;
}
