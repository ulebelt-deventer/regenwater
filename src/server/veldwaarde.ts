import { isAnnotatieLijst } from '../shared/kaart.ts';
import { ITEM_ID, type Veld } from '../shared/velden.ts';
import type { Json } from '../shared/types.ts';
import { fout } from './context.ts';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const DATUM_TIJD = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function geldigeDatum(s: string): boolean {
  const [j, m, d] = s.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(j, m - 1, d));
  return t.getUTCFullYear() === j && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function uniekeLijst(v: Json, toegestaan: (s: string) => boolean): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string' && toegestaan(x)) && new Set(v).size === v.length;
}

// Checks one autosaved value against its field definition and normalizes empty to null. Throws 400 on anything the UI can't send.
export function controleerWaarde(veld: Veld, anders: boolean, v: Json): Json {
  // The explicit `never` annotation is what lets TS narrow `v` after each `ongeldig()` call.
  const ongeldig: () => never = () => fout(400, `Ongeldige waarde voor ${veld.label}`);
  if (v === null) return null;
  if (anders) {
    if (typeof v !== 'string') ongeldig();
    return v.trim() === '' ? null : v;
  }
  switch (veld.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'textarea':
      if (typeof v !== 'string') ongeldig();
      return v.trim() === '' ? null : v;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) ongeldig();
      if ((veld.min !== undefined && v < veld.min) || (veld.max !== undefined && v > veld.max)) {
        fout(400, `${veld.label} moet tussen ${veld.min ?? '-∞'} en ${veld.max ?? '∞'} liggen.`);
      }
      return v;
    case 'radio':
      if (typeof v !== 'string' || !veld.opties!.some(([k]) => k === v)) ongeldig();
      return v;
    case 'select':
      if (typeof v !== 'string' || !ITEM_ID.test(v)) ongeldig();
      return v;
    case 'checks':
      if (!uniekeLijst(v, (s) => veld.opties!.some(([k]) => k === s))) ongeldig();
      return v.length ? v : null;
    case 'ids':
      if (!uniekeLijst(v, (s) => ITEM_ID.test(s))) ongeldig();
      return v.length ? v : null;
    case 'date':
      if (typeof v !== 'string' || !DATUM.test(v) || !geldigeDatum(v)) ongeldig();
      return v;
    case 'datetime':
      if (typeof v !== 'string' || !DATUM_TIJD.test(v) || !geldigeDatum(v)) ongeldig();
      return v;
    case 'annotaties':
      if (!isAnnotatieLijst(v)) ongeldig();
      return v;
  }
}
