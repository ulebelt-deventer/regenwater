// Autosave: every edit goes through a queue that survives a reload or a dropped connection.
// Field edits and kaart tekeningen live in localStorage; photos (too big for it) in IndexedDB.
import { createSignal } from 'solid-js';
import { FOTO_MAX_PX } from '../shared/constants.ts';
import type { Annotatie, Foto, Json } from '../shared/types.ts';
import { ApiFout, api, isNetwerkFout } from './api.ts';
import { melding } from './ui.tsx';

export type Item =
  | { soort: 'veld'; dossierId: number; key: string; value: Json }
  | { soort: 'annotaties'; dossierId: number; fotoId: string; value: Annotatie[] };

interface Rij {
  nr: number; // replaced on every merge, so a reply for an older value never removes a newer one
  item: Item;
}

const SLEUTEL = 'regenton.wachtrij';
const VERTRAGING_MS = 400;

function laad(): Rij[] {
  const s = localStorage.getItem(SLEUTEL);
  return s ? (JSON.parse(s) as Item[]).map((item, i) => ({ nr: i + 1, item })) : [];
}

let rijen = laad();
let teller = rijen.length;
const [aantal, setAantal] = createSignal(rijen.length);
const [mislukt, setMislukt] = createSignal(false);
const [opgeslagenOm, setOpgeslagenOm] = createSignal<Date | null>(null);

function bewaar(): void {
  localStorage.setItem(SLEUTEL, JSON.stringify(rijen.map((r) => r.item)));
  setAantal(rijen.length);
}

const doel = (i: Item) => (i.soort === 'veld' ? `v:${i.dossierId}:${i.key}` : `a:${i.fotoId}`);

// Listeners, per dossier page: a saved field returns the new plan_gewijzigd_at; a rejected one makes the page reload.
type Luisteraar = {
  opgeslagen: (item: Item, planGewijzigdAt: string | null) => void;
  afgewezen: () => void;
  foto: (f: Foto, slot: string, vervang: string | null, planGewijzigdAt: string | null) => void;
};
const luisteraars = new Map<number, Set<Luisteraar>>();
export function luister(dossierId: number, l: Luisteraar): () => void {
  if (!luisteraars.has(dossierId)) luisteraars.set(dossierId, new Set());
  luisteraars.get(dossierId)!.add(l);
  return () => luisteraars.get(dossierId)!.delete(l);
}
const voor = (dossierId: number) => [...(luisteraars.get(dossierId) ?? [])];

export function zetInWachtrij(item: Item): void {
  const i = rijen.findIndex((r) => doel(r.item) === doel(item));
  const rij = { nr: ++teller, item };
  if (i >= 0) rijen[i] = rij;
  else rijen.push(rij);
  bewaar();
  plan(VERTRAGING_MS);
}

// Unsent values for one dossier, to lay over a freshly loaded copy.
export function wachtend(dossierId: number): Item[] {
  return rijen.map((r) => r.item).filter((i) => i.dossierId === dossierId);
}

// api() is already on its way to the login page; the queue stays put and is sent once the next page load starts it.
const sessieVerlopen = (e: unknown) => e instanceof ApiFout && e.status === 401;

let timer: ReturnType<typeof setTimeout> | null = null;
let bezig = false;
let pogingen = 0;

function plan(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void verwerk(), ms);
}

async function verwerk(): Promise<void> {
  timer = null;
  if (bezig) return;
  bezig = true;
  try {
    while (rijen.length) {
      const rij = rijen[0];
      const it = rij.item;
      try {
        let planAt: string | null;
        if (it.soort === 'veld') {
          planAt = (await api('PATCH', `/api/dossiers/${it.dossierId}`, { key: it.key, value: it.value })).plan_gewijzigd_at;
        } else {
          planAt = (await api('PUT', `/api/fotos/${it.fotoId}/annotaties`, { annotaties: it.value })).plan_gewijzigd_at;
        }
        for (const l of voor(it.dossierId)) l.opgeslagen(it, planAt);
        setOpgeslagenOm(new Date());
      } catch (e) {
        if (sessieVerlopen(e)) return;
        if (isNetwerkFout(e)) {
          if (!mislukt()) melding('danger', 'Opslaan mislukt: er is geen verbinding met de server. Je wijzigingen blijven bewaard en worden opnieuw verstuurd.');
          setMislukt(true);
          pogingen++;
          plan(Math.min(30000, 1000 * 2 ** Math.min(pogingen, 5)));
          return;
        }
        melding('danger', `Opslaan mislukt: ${(e as ApiFout).message}`);
        for (const l of voor(it.dossierId)) l.afgewezen();
      }
      pogingen = 0;
      setMislukt(false);
      rijen = rijen.filter((r) => r.nr !== rij.nr);
      bewaar();
    }
  } finally {
    bezig = false;
  }
}

// ---- Photos ----

interface FotoTaak {
  id: string;
  dossierId: number;
  slot: string;
  vervang: string | null;
  naam: string;
  blob: Blob;
}

let dbBelofte: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbBelofte ??= new Promise((ok, nok) => {
    const r = indexedDB.open('regenton-fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('taken', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nok(r.error);
  });
  return dbBelofte;
}

async function opslagActie<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, nok) => {
    const t = d.transaction('taken', modus);
    const r = fn(t.objectStore('taken'));
    t.oncomplete = () => ok(r.result);
    t.onerror = () => nok(t.error);
  });
}

export interface WachtendeFoto {
  id: string;
  dossierId: number;
  slot: string;
  url: string;
}
const [wachtendeFotos, setWachtendeFotos] = createSignal<WachtendeFoto[]>([]);
export { wachtendeFotos };

let fotoBezig = false;
let fotoPogingen = 0;

export async function fotoInWachtrij(t: Omit<FotoTaak, 'id'>): Promise<void> {
  const taak = { ...t, id: crypto.randomUUID() };
  await opslagActie('readwrite', (s) => s.add(taak));
  setWachtendeFotos((w) => [...w, { id: taak.id, dossierId: taak.dossierId, slot: taak.slot, url: URL.createObjectURL(taak.blob) }]);
  void verwerkFotos();
}

async function verwerkFotos(): Promise<void> {
  if (fotoBezig) return;
  fotoBezig = true;
  try {
    for (;;) {
      const taken = (await opslagActie('readonly', (s) => s.getAll())) as FotoTaak[];
      if (!taken.length) break;
      const t = taken[0];
      try {
        const pad = `/api/dossiers/${t.dossierId}/fotos/${encodeURIComponent(t.slot)}${t.vervang ? `?vervang=${t.vervang}` : ''}`;
        const r = await api<{ foto: Foto; plan_gewijzigd_at: string | null }>('POST', pad, t.blob);
        for (const l of voor(t.dossierId)) l.foto(r.foto, t.slot, t.vervang, r.plan_gewijzigd_at);
        setOpgeslagenOm(new Date());
      } catch (e) {
        if (sessieVerlopen(e)) return;
        if (isNetwerkFout(e)) {
          fotoPogingen++;
          setTimeout(() => void verwerkFotos(), Math.min(30000, 1000 * 2 ** Math.min(fotoPogingen, 5)));
          return;
        }
        const f = e as ApiFout;
        melding('danger', f.status === 400 || f.status === 413 || f.status === 415 ? `${t.naam} kon niet worden toegevoegd. Gebruik een JPG- of PNG-afbeelding.` : `${t.naam}: ${f.message}`);
      }
      fotoPogingen = 0;
      await opslagActie('readwrite', (s) => s.delete(t.id));
      setWachtendeFotos((w) => {
        const weg = w.find((x) => x.id === t.id);
        if (weg) URL.revokeObjectURL(weg.url);
        return w.filter((x) => x.id !== t.id);
      });
    }
  } finally {
    fotoBezig = false;
  }
}

// Picks up uploads left from an earlier visit.
async function hervatFotos(): Promise<void> {
  const taken = (await opslagActie('readonly', (s) => s.getAll())) as FotoTaak[];
  setWachtendeFotos(taken.map((t) => ({ id: t.id, dossierId: t.dossierId, slot: t.slot, url: URL.createObjectURL(t.blob) })));
  void verwerkFotos();
}

// Any image the browser can decode, downscaled to FOTO_MAX_PX on the longest side, as a JPEG.
export async function naarJpeg(bestand: Blob): Promise<Blob> {
  const bron = await createImageBitmap(bestand);
  const schaal = Math.min(1, FOTO_MAX_PX / Math.max(bron.width, bron.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bron.width * schaal);
  canvas.height = Math.round(bron.height * schaal);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNG/SVG areas would turn black in a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bron, 0, 0, canvas.width, canvas.height);
  bron.close();
  return new Promise((ok, nok) => canvas.toBlob((b) => (b ? ok(b) : nok(new Error('Omzetten mislukt'))), 'image/jpeg', 0.85));
}

// ---- Status for the indicator ----

export type OpslagStatus = 'opgeslagen' | 'bezig' | 'mislukt';
export function opslagStatus(): OpslagStatus {
  if (mislukt()) return 'mislukt';
  return aantal() > 0 || wachtendeFotos().length > 0 ? 'bezig' : 'opgeslagen';
}
export { opgeslagenOm };

export function startOpslag(): void {
  window.addEventListener('beforeunload', (e) => {
    if (aantal() > 0 || wachtendeFotos().length > 0) e.preventDefault();
  });
  window.addEventListener('online', () => {
    plan(0);
    void verwerkFotos();
  });
  if (rijen.length) plan(0);
  void hervatFotos();
}
