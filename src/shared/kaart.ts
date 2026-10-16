import { NORMAFVOER_MM } from './constants.ts';
import type { Annotatie, AnnotatieType, Dossier, Foto, Json } from './types.ts';

type Pt = [number, number];

export function letter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Labels follow array order, so deleting an item renumbers the rest without touching stored IDs.
export function annotatieLabels(annots: Annotatie[]): Map<string, string> {
  const tel = { schets: 0, pijl: 0, dak: 0, tuin: 0, steen: 0, regenpijp: 0, tekst: 0 };
  const labels = new Map<string, string>();
  for (const a of annots) {
    const i = tel[a.type]++;
    if (a.type === 'dak') labels.set(a.id, `D${i + 1}`);
    else if (a.type === 'tuin') labels.set(a.id, `T${i + 1}`);
    else if (a.type === 'steen') labels.set(a.id, `S${i + 1}`);
    else if (a.type === 'regenpijp') labels.set(a.id, letter(i));
  }
  return labels;
}

export function oppervlakPx(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function zwaartepunt(p: Pt[]): Pt {
  const x = p.reduce((s, q) => s + q[0], 0) / p.length;
  const y = p.reduce((s, q) => s + q[1], 0) / p.length;
  return [x, y];
}

export function binnen(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function afstandTotLijn(pt: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

export function afstandTotRand(pt: Pt, poly: Pt[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) min = Math.min(min, afstandTotLijn(pt, poly[i], poly[(i + 1) % poly.length]));
  return min;
}

export function afstandTotPolygoon(pt: Pt, poly: Pt[]): number {
  return binnen(pt, poly) ? 0 : afstandTotRand(pt, poly);
}

export function dichtstbijzijndeDak(pt: Pt, daken: Annotatie[]): string | null {
  let best: string | null = null;
  let min = Infinity;
  for (const d of daken) {
    const afstand = afstandTotPolygoon(pt, d.p);
    if (afstand < min) {
      min = afstand;
      best = d.id;
    }
  }
  return best;
}

// Polygon annotations: drawn corner by corner, filled, and measured on a scaled kaart.
export const VLAK_TYPES = ['dak', 'tuin', 'steen'] as const;
export const isVlak = (t: AnnotatieType): t is (typeof VLAK_TYPES)[number] => (VLAK_TYPES as readonly string[]).includes(t);

export function kaartAnnotaties(d: Dossier): Annotatie[] {
  const v = d.data.kaart_annotaties;
  return v === undefined || v === null ? [] : (v as unknown as Annotatie[]);
}

export function kaartFoto(d: Dossier): Foto | null {
  const fotos = d.fotos.filter((f) => f.slot === 'kaart');
  return fotos.length ? fotos[fotos.length - 1] : null;
}

// A regenpijp this close to a dakdeel is linked to it automatically. On an unscaled kaart, and for a pijp near no dakdeel, it's the nearest dakdeel only.
export const KOPPEL_M = 1;

// How much of a dakdeel drains through one regenpijp, in whole percents. A dakdeel's aandelen add up to 100.
export interface Aandeel {
  pijp: string;
  pct: number;
}
export interface DakDeel {
  id: string;
  label: string;
  m2: number | null;
  m2Berekend: boolean;
  verdeling: Aandeel[]; // in regenpijp order; empty when no regenpijp drains it
  automatischeVerdeling: Aandeel[];
  automatisch: boolean;
  verlopen: boolean; // the hand-set verdeling names a regenpijp that's gone, so the automatic one applies
  afstandM: Map<string, number | null>; // per regenpijp; null on an unscaled kaart
}
// A tuindeel or a steen: a measured area with photos.
export interface Vlak {
  id: string;
  label: string;
  m2: number | null;
  m2Berekend: boolean;
}
export interface Bron {
  dak: string;
  pct: number;
}
export interface Regenpijp {
  id: string;
  label: string;
  bronnen: Bron[]; // in dakdeel order
}

function handmatigM2(d: Dossier, key: string): number | null {
  const v = d.data[key];
  return typeof v === 'number' ? v : null;
}

export interface KaartItems {
  daken: DakDeel[];
  tuinen: Vlak[];
  stenen: Vlak[];
  regenpijpen: Regenpijp[];
  labels: Map<string, string>;
  opSchaal: boolean;
}

export function kaartItems(d: Dossier): KaartItems {
  const annots = kaartAnnotaties(d);
  const labels = annotatieLabels(annots);
  const foto = kaartFoto(d);
  const schaal = foto ? foto.m_per_px : null;
  const m2 = (a: Annotatie, key: string) =>
    schaal !== null ? Math.round(oppervlakPx(a.p) * schaal * schaal * 10) / 10 : handmatigM2(d, key);
  const dakAnnots = annots.filter((a) => a.type === 'dak');
  const pijpAnnots = annots.filter((a) => a.type === 'regenpijp');
  const auto = new Map(pijpAnnots.map((p) => [p.id, automatischeDaken(p.p[0], dakAnnots, schaal)]));
  const daken: DakDeel[] = dakAnnots.map((a) => {
    const automatischeVerdeling = verdeel(a, pijpAnnots.filter((p) => auto.get(p.id)!.includes(a.id))).filter((x) => x.pct > 0);
    const hand = handmatigeVerdeling(d, a.id);
    const verlopen = hand !== null && Object.keys(hand).some((id) => !pijpAnnots.some((p) => p.id === id));
    const geldig = hand !== null && !verlopen ? hand : null;
    return {
      id: a.id,
      label: labels.get(a.id)!,
      m2: m2(a, `dak.${a.id}.m2`),
      m2Berekend: schaal !== null,
      verdeling: geldig ? pijpAnnots.filter((p) => p.id in geldig).map((p) => ({ pijp: p.id, pct: geldig[p.id] })) : automatischeVerdeling,
      automatischeVerdeling,
      automatisch: geldig === null,
      verlopen,
      afstandM: new Map(pijpAnnots.map((p) => [p.id, schaal === null ? null : afstandTotPolygoon(p.p[0], a.p) * schaal])),
    };
  });
  const regenpijpen = pijpAnnots.map((a) => ({
    id: a.id,
    label: labels.get(a.id)!,
    bronnen: daken.flatMap((dak) => dak.verdeling.filter((x) => x.pijp === a.id).map((x) => ({ dak: dak.id, pct: x.pct }))),
  }));
  const vlakken = (type: 'tuin' | 'steen') =>
    annots.filter((a) => a.type === type).map((a) => ({ id: a.id, label: labels.get(a.id)!, m2: m2(a, `${type}.${a.id}.m2`), m2Berekend: schaal !== null }));
  return { daken, tuinen: vlakken('tuin'), stenen: vlakken('steen'), regenpijpen, labels, opSchaal: schaal !== null };
}

// ---- Which regenpijpen drain a dakdeel, and how much each takes. The method and its limits: docs/berekening.md ----

function handmatigeVerdeling(d: Dossier, dakId: string): Record<string, number> | null {
  const v = d.data[`dak.${dakId}.verdeling`];
  return v === undefined || v === null ? null : (v as Record<string, number>);
}

function automatischeDaken(pijp: Pt, daken: Annotatie[], schaal: number | null): string[] {
  if (schaal !== null) {
    const dichtbij = daken.filter((d) => afstandTotPolygoon(pijp, d.p) * schaal <= KOPPEL_M).map((d) => d.id);
    if (dichtbij.length) return dichtbij;
  }
  const dichtst = dichtstbijzijndeDak(pijp, daken);
  return dichtst === null ? [] : [dichtst];
}

// Whole percents adding up to exactly `totaal` (largest remainder), in proportion to the weights; all-zero weights split evenly.
export function procenten(gewichten: number[], totaal = 100): number[] {
  if (!gewichten.length) return [];
  const som = gewichten.reduce((s, g) => s + g, 0);
  const ruw = gewichten.map((g) => (som > 0 ? (g / som) * totaal : totaal / gewichten.length));
  const heel = ruw.map(Math.floor);
  let over = totaal - heel.reduce((s, h) => s + h, 0);
  const volgorde = ruw.map((r, i) => ({ rest: r - heel[i], i })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of volgorde) {
    if (over <= 0) break;
    heel[i]++;
    over--;
  }
  return heel;
}

// The part of `poly` on the near side of the line through `m` with normal `n` (Sutherland-Hodgman, one edge). A concave poly can come out with zero-width bridges along the line; they add no area.
function knip(poly: Pt[], m: Pt, n: Pt): Pt[] {
  const kant = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  const uit: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [ka, kb] = [kant(a), kant(b)];
    if (ka <= 0) uit.push(a);
    if ((ka < 0 && kb > 0) || (ka > 0 && kb < 0)) {
      const t = ka / (ka - kb);
      uit.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return uit;
}

// Each pijp's share of the dakdeel: the part of it closer to that pijp than to the others, since water runs to the nearest downpipe. Pijpen on the same spot split their part evenly.
export function dichtstbijzijndeVerdeling(dak: Pt[], pijpen: Pt[]): number[] {
  return procenten(
    pijpen.map((p, i) => {
      let cel = dak;
      pijpen.forEach((q, j) => {
        if (j !== i && (q[0] !== p[0] || q[1] !== p[1])) cel = knip(cel, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [q[0] - p[0], q[1] - p[1]]);
      });
      return oppervlakPx(cel);
    }),
  );
}

function verdeel(dak: Annotatie, pijpen: Annotatie[]): Aandeel[] {
  const pct = dichtstbijzijndeVerdeling(dak.p, pijpen.map((p) => p.p[0]));
  return pijpen.map((p, i) => ({ pijp: p.id, pct: pct[i] }));
}

// The verdeling after the bezoeker ticks a set of regenpijpen: the nearest-pijp split again, with at least 1% for each ticked one so it stays ticked.
export function verdelingVoor(d: Dossier, dakId: string, pijpIds: string[]): Aandeel[] {
  const annots = kaartAnnotaties(d);
  const dak = annots.find((a) => a.id === dakId && a.type === 'dak');
  if (!dak) throw new Error(`Dak ${dakId} staat niet op de kaart`);
  const pijpen = annots.filter((a) => a.type === 'regenpijp' && pijpIds.includes(a.id));
  const uit = verdeel(dak, pijpen);
  for (const nul of uit.filter((a) => a.pct === 0)) {
    nul.pct = 1;
    uit.reduce((max, a) => (a.pct > max.pct ? a : max)).pct--;
  }
  return uit;
}

// Sets one pijp's percent and scales the others to fill the rest, keeping their mutual ratio (evenly when they're all 0). A pijp that ends up at 0% drops out.
export function herverdeel(verdeling: Aandeel[], pijp: string, pct: number): Aandeel[] {
  if (!verdeling.some((a) => a.pijp === pijp)) throw new Error(`Regenpijp ${pijp} hoort niet bij deze verdeling`);
  const rest = verdeling.filter((a) => a.pijp !== pijp);
  const p = rest.length ? Math.max(0, Math.min(100, Math.round(pct))) : pct > 0 ? 100 : 0;
  const restPct = procenten(rest.map((a) => a.pct), 100 - p);
  return verdeling.map((a) => (a.pijp === pijp ? { pijp, pct: p } : { pijp: a.pijp, pct: restPct[rest.indexOf(a)] })).filter((a) => a.pct > 0);
}

// What to store for a dakdeel's verdeling: null while it equals the automatic one.
export function verdelingWaarde(dak: DakDeel, verdeling: Aandeel[]): Json {
  const zelfde = verdeling.length === dak.automatischeVerdeling.length && verdeling.every((a, i) => a.pijp === dak.automatischeVerdeling[i].pijp && a.pct === dak.automatischeVerdeling[i].pct);
  return zelfde ? null : Object.fromEntries(verdeling.map((a) => [a.pijp, a.pct]));
}

// The dakdelen whose hand-set verdeling a kaart edit voids: a dakdeel that was moved or reshaped, and every dakdeel near or linked to a regenpijp that was added, moved or removed.
export function verdelingenTeWissen(d: Dossier, oud: Annotatie[], nieuw: Annotatie[]): string[] {
  const foto = kaartFoto(d);
  const schaal = foto ? foto.m_per_px : null;
  const zelfde = (a: Annotatie, b: Annotatie | undefined) => b !== undefined && JSON.stringify(a.p) === JSON.stringify(b.p);
  const gewijzigd = (type: AnnotatieType) => {
    const o = oud.filter((a) => a.type === type);
    const n = nieuw.filter((a) => a.type === type);
    return [...o.filter((a) => !zelfde(a, n.find((x) => x.id === a.id))), ...n.filter((a) => !zelfde(a, o.find((x) => x.id === a.id)))];
  };
  const daken = nieuw.filter((a) => a.type === 'dak');
  const wissen = new Set(gewijzigd('dak').map((a) => a.id));
  for (const p of gewijzigd('regenpijp')) {
    for (const id of automatischeDaken(p.p[0], daken, schaal)) wissen.add(id);
    for (const dak of daken) {
      const hand = handmatigeVerdeling(d, dak.id);
      if (hand !== null && p.id in hand) wissen.add(dak.id);
    }
  }
  return daken.filter((a) => wissen.has(a.id) && handmatigeVerdeling(d, a.id) !== null).map((a) => a.id);
}

// Per regenpijp: its share of each dakdeel's m², times the normafvoer. Null while a dakdeel's m² is unknown.
export function waterberging(pijp: Regenpijp, daken: DakDeel[]): { liter: number; uitleg: string } | null {
  if (!pijp.bronnen.length) return null;
  const delen = pijp.bronnen.map((b) => {
    const dak = daken.find((x) => x.id === b.dak);
    if (!dak) throw new Error(`Dak ${b.dak} van regenpijp ${pijp.label} ontbreekt`);
    return { pct: b.pct, m2: dak.m2 };
  });
  if (delen.some((x) => x.m2 === null)) return null;
  const m2 = delen.reduce((s, x) => s + (x.pct / 100) * x.m2!, 0);
  const liter = Math.round(m2 * NORMAFVOER_MM);
  const termen = delen.map((x) => (x.pct === 100 ? `${getal(x.m2!)} m²` : `${x.pct}% × ${getal(x.m2!)} m²`));
  const som = delen.length === 1 && delen[0].pct === 100 ? '' : ` = ${getal(m2)} m²`;
  return { liter, uitleg: `${termen.join(' + ')}${som} × ${NORMAFVOER_MM} mm = ${liter} liter` };
}

// "A 62% · B 38%", or just "A" for a single pijp.
export function verdelingTekst(dak: DakDeel, labels: Map<string, string>): string {
  return dak.verdeling.map((a) => (a.pct === 100 ? labels.get(a.pijp)! : `${labels.get(a.pijp)!} ${a.pct}%`)).join(' · ');
}

// "D1 (62%)", or just "D2" when this pijp takes all of it.
export function bronLabel(bron: Regenpijp['bronnen'][number], labels: Map<string, string>): string {
  return bron.pct === 100 ? labels.get(bron.dak)! : `${labels.get(bron.dak)!} (${bron.pct}%)`;
}

// "D1 (62%), D2": how much of each dakdeel this pijp takes.
export function bronnenTekst(pijp: Regenpijp, labels: Map<string, string>): string {
  return pijp.bronnen.map((b) => bronLabel(b, labels)).join(', ');
}

// A square around `punten` with a margin, moved inside the image where it fits: a pijp's thumbnail of its dakdelen.
export function vierkanteUitsnede(punten: Pt[], breedte: number, hoogte: number): { x: number; y: number; zijde: number } {
  const xs = punten.map((q) => q[0]);
  const ys = punten.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zijde = Math.max(x1 - x0, y1 - y0, Math.max(breedte, hoogte) / 10) * 1.3;
  const binnen = (midden: number, totaal: number) => (zijde >= totaal ? (totaal - zijde) / 2 : Math.max(0, Math.min(totaal - zijde, midden - zijde / 2)));
  return { x: binnen((x0 + x1) / 2, breedte), y: binnen((y0 + y1) / 2, hoogte), zijde };
}

// A regenpijp's thumbnail: centred on the pijp and 5 m each way on a kaart to scale; otherwise around `punten` (the pijp and its dakdelen).
export function regenpijpUitsnede(pijp: Pt, punten: Pt[], foto: Pick<Foto, 'breedte' | 'hoogte' | 'm_per_px'>): { x: number; y: number; zijde: number } {
  if (foto.m_per_px === null) return vierkanteUitsnede(punten, foto.breedte, foto.hoogte);
  const r = 5 / foto.m_per_px;
  return { x: pijp[0] - r, y: pijp[1] - r, zijde: 2 * r };
}

export function getal(n: number): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
}

export function zijdeLengtes(p: Pt[], mPerPx: number): number[] {
  return p.map((q, i) => {
    const r = p[(i + 1) % p.length];
    return Math.hypot(r[0] - q[0], r[1] - q[1]) * mPerPx;
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const KLEUR = { schets: '#ff0000', pijl: '#ff713e', tekst: '#ffffff', dak: '#86afe2', tuin: '#88d356', steen: '#e5383b', regenpijp: '#00643c' };
// Each kaart onderdeel's Bootstrap Icons name and color, in the app and the PDFs.
export const ICOON = {
  dak: { naam: 'house', kleur: '#2f6db5' },
  tuin: { naam: 'leaf', kleur: '#3d8b2a' },
  steen: { naam: 'bricks', kleur: '#9c4a2f' },
  regenpijp: { naam: 'droplet', kleur: '#2f6db5' },
} as const;
export type IcoonSoort = keyof typeof ICOON;
// A Tekst annotation's font size in units of `schaal`; the editor's hit test uses it too.
export const TEKST_PX = 14 * 1.21;

// One SVG drawing function for the editor and the PDFs. `schaal` is the stroke/text size unit in image pixels.
export function annotatiesSvg(annots: Annotatie[], opts: { schaal: number; mPerPx: number | null; geselecteerd?: string | null }): string {
  const labels = annotatieLabels(annots);
  const u = opts.schaal;
  const tekst = (x: number, y: number, t: string, kleur: string, grootte = 1) =>
    `<text x="${x}" y="${y}" font-size="${14 * u * grootte}" font-family="Figtree, sans-serif" font-weight="800" fill="${kleur}" stroke="#1a1a1a" stroke-width="${3 * u}" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${esc(t)}</text>`;
  const out: string[] = [];
  for (const a of annots) {
    const sel = a.id === opts.geselecteerd;
    const breed = (sel ? 5 : 3) * u;
    const label = labels.get(a.id);
    if (isVlak(a.type)) {
      const pts = a.p.map((q) => q.join(',')).join(' ');
      const kleur = KLEUR[a.type];
      out.push(`<polygon points="${pts}" fill="${kleur}" fill-opacity="0.25" stroke="${kleur}" stroke-width="${breed}" stroke-linejoin="round"/>`);
      if (a.p.length >= 3) {
        const [cx, cy] = zwaartepunt(a.p);
        const opp = opts.mPerPx !== null ? `${getal(Math.round(oppervlakPx(a.p) * opts.mPerPx * opts.mPerPx * 10) / 10)} m²` : '';
        out.push(tekst(cx, cy, label!, '#ffffff', 1.2));
        if (opp) out.push(tekst(cx, cy + 18 * u, opp, '#ffffff', 0.9));
        if (opts.mPerPx !== null) {
          zijdeLengtes(a.p, opts.mPerPx).forEach((l, i) => {
            const q = a.p[i];
            const r = a.p[(i + 1) % a.p.length];
            out.push(tekst((q[0] + r[0]) / 2, (q[1] + r[1]) / 2, `${getal(Math.round(l * 10) / 10)} m`, '#ffffff', 0.75));
          });
        }
      }
    } else if (a.type === 'regenpijp') {
      const [x, y] = a.p[0];
      out.push(`<circle cx="${x}" cy="${y}" r="${11 * u}" fill="${KLEUR.regenpijp}" stroke="#ffffff" stroke-width="${(sel ? 4 : 2) * u}"/>`);
      out.push(`<text x="${x}" y="${y}" font-size="${13 * u}" font-family="Figtree, sans-serif" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${esc(label!)}</text>`);
    } else if (a.type === 'schets') {
      out.push(`<path d="M${a.p.map((q) => q.join(' ')).join(' L')}" fill="none" stroke="${KLEUR.schets}" stroke-width="${7 * u}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (a.type === 'pijl') {
      const [[x1, y1], [x2, y2]] = a.p;
      const hoek = Math.atan2(y2 - y1, x2 - x1);
      const k = 14 * u;
      const punt = (h: number) => `${x2 - k * Math.cos(hoek + h)},${y2 - k * Math.sin(hoek + h)}`;
      // The line stops inside the head: its round cap would otherwise poke out past the tip.
      const [lx, ly] = [x2 - 0.6 * k * Math.cos(hoek), y2 - 0.6 * k * Math.sin(hoek)];
      out.push(`<line x1="${x1}" y1="${y1}" x2="${lx}" y2="${ly}" stroke="${KLEUR.pijl}" stroke-width="${breed}" stroke-linecap="round"/>`);
      out.push(`<polygon points="${x2},${y2} ${punt(0.45)} ${punt(-0.45)}" fill="${KLEUR.pijl}"/>`);
    } else {
      const [x, y] = a.p[0];
      out.push(tekst(x, y, a.tekst ?? '', sel ? '#ffd84d' : '#ffffff', TEKST_PX / 14));
    }
  }
  return out.join('');
}

export function isAnnotatieLijst(v: Json): boolean {
  if (!Array.isArray(v)) return false;
  return v.every((a) => {
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return false;
    const o = a as Record<string, Json>;
    return (
      typeof o.id === 'string' &&
      ['schets', 'pijl', 'tekst', 'dak', 'tuin', 'steen', 'regenpijp'].includes(o.type as string) &&
      Array.isArray(o.p) &&
      o.p.every((q) => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === 'number' && Number.isFinite(n))) &&
      (o.tekst === undefined || typeof o.tekst === 'string')
    );
  });
}
