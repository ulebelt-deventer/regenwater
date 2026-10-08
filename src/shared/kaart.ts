import { NORMAFVOER_MM } from './constants.ts';
import type { Annotatie, Dossier, Foto, Json } from './types.ts';

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
  const tel = { pijl: 0, dak: 0, tuin: 0, regenpijp: 0, tekst: 0 };
  const labels = new Map<string, string>();
  for (const a of annots) {
    const i = tel[a.type]++;
    if (a.type === 'dak') labels.set(a.id, `D${i + 1}`);
    else if (a.type === 'tuin') labels.set(a.id, `T${i + 1}`);
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

export function afstandTotPolygoon(pt: Pt, poly: Pt[]): number {
  if (binnen(pt, poly)) return 0;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) min = Math.min(min, afstandTotLijn(pt, poly[i], poly[(i + 1) % poly.length]));
  return min;
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

export function kaartAnnotaties(d: Dossier): Annotatie[] {
  const v = d.data.kaart_annotaties;
  return v === undefined || v === null ? [] : (v as unknown as Annotatie[]);
}

export function kaartFoto(d: Dossier): Foto | null {
  const fotos = d.fotos.filter((f) => f.slot === 'kaart');
  return fotos.length ? fotos[fotos.length - 1] : null;
}

export interface DakDeel {
  id: string;
  label: string;
  m2: number | null;
  m2Berekend: boolean;
  regenpijpen: string[];
}
export interface TuinDeel {
  id: string;
  label: string;
  m2: number | null;
  m2Berekend: boolean;
}
export interface Regenpijp {
  id: string;
  label: string;
  dak: string | null;
  dakAutomatisch: boolean;
}

function handmatigM2(d: Dossier, key: string): number | null {
  const v = d.data[key];
  return typeof v === 'number' ? v : null;
}

export interface KaartItems {
  daken: DakDeel[];
  tuinen: TuinDeel[];
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
  const regenpijpen: Regenpijp[] = annots
    .filter((a) => a.type === 'regenpijp')
    .map((a) => {
      const gekozen = d.data[`regenpijp.${a.id}.dak`];
      const geldig = typeof gekozen === 'string' && dakAnnots.some((x) => x.id === gekozen);
      return {
        id: a.id,
        label: labels.get(a.id)!,
        dak: geldig ? (gekozen as string) : dichtstbijzijndeDak(a.p[0], dakAnnots),
        dakAutomatisch: !geldig,
      };
    });
  const daken = dakAnnots.map((a) => ({
    id: a.id,
    label: labels.get(a.id)!,
    m2: m2(a, `dak.${a.id}.m2`),
    m2Berekend: schaal !== null,
    regenpijpen: regenpijpen.filter((r) => r.dak === a.id).map((r) => r.id),
  }));
  const tuinen = annots
    .filter((a) => a.type === 'tuin')
    .map((a) => ({ id: a.id, label: labels.get(a.id)!, m2: m2(a, `tuin.${a.id}.m2`), m2Berekend: schaal !== null }));
  return { daken, tuinen, regenpijpen, labels, opSchaal: schaal !== null };
}

export function waterberging(dak: DakDeel): { liter: number; uitleg: string } | null {
  if (dak.m2 === null || dak.regenpijpen.length === 0) return null;
  const n = dak.regenpijpen.length;
  const liter = Math.round((dak.m2 / n) * NORMAFVOER_MM);
  return { liter, uitleg: `${getal(dak.m2)} m² ÷ ${n} × ${NORMAFVOER_MM} mm = ${liter} liter` };
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

const KLEUR = { pijl: '#ff713e', tekst: '#ffffff', dak: '#86afe2', tuin: '#88d356', regenpijp: '#00643c' };

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
    if (a.type === 'dak' || a.type === 'tuin') {
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
      out.push(tekst(x, y, a.tekst ?? '', sel ? '#ffd84d' : '#ffffff', 1.1));
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
      ['pijl', 'tekst', 'dak', 'tuin', 'regenpijp'].includes(o.type as string) &&
      Array.isArray(o.p) &&
      o.p.every((q) => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === 'number' && Number.isFinite(n))) &&
      (o.tekst === undefined || typeof o.tekst === 'string')
    );
  });
}
