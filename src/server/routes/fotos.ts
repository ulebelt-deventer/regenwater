import fs from 'node:fs';
import type { Hono } from 'hono';
import sharp from 'sharp';
import { FOTO_MAX_PX, LUCHTFOTO_MAX_PX } from '../../shared/constants.ts';
import { isAnnotatieLijst } from '../../shared/kaart.ts';
import { magBewerken, magZien } from '../../shared/rechten.ts';
import type { Annotatie, Dossier, Json } from '../../shared/types.ts';
import { fotoSlotVoor, type FotoSlot, waarde } from '../../shared/velden.ts';
import { auditWijzigingen } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type C, type Ctx, type Env, actorVan, body, fout } from '../context.ts';
import { bewaarFoto, fotoPad } from '../fotos.ts';
import { type Bbox, dichtsteBoring, luchtfoto, straatBij } from '../pdok.ts';
import { fotoVan, laadDossier } from '../repo.ts';
import { haalDossier, nietGesloten, planGewijzigd } from './dossiers.ts';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const LUCHTFOTO_PREVIEW_PX = 1000;
// Sides of a luchtfoto frame in meters: big enough for a street block, small enough to stay a garden-scale map.
const BBOX_MIN_M = 10;
const BBOX_MAX_M = 400;
const BBOX_MAX_AFSTAND_M = 500;

interface FotoRij {
  id: string;
  dossier_id: number;
  slot: string;
  verwijderd_at: string | null;
}

function slotVan(key: string): FotoSlot {
  const s = fotoSlotVoor(key);
  if (!s) fout(404, 'Onbekend fotovak');
  return s.slot;
}

function magFotoBewerken(c: C, d: Dossier, slot: FotoSlot): void {
  nietGesloten(d);
  if (!magBewerken(c.get('ik'), d, slot.bewerkers)) fout(403, 'Je mag deze foto niet wijzigen');
}

// The photo, its dossier and its slot definition; 404 unless this user may see it.
function haalFoto(ctx: Ctx, c: C): { f: FotoRij; d: Dossier; slot: FotoSlot } {
  const f = ctx.db.prepare('SELECT id, dossier_id, slot, verwijderd_at FROM fotos WHERE id = ?').get(c.req.param('id')) as FotoRij | undefined;
  const d = f && !f.verwijderd_at ? laadDossier(ctx.db, f.dossier_id) : null;
  if (!f || !d || !magZien(c.get('ik'), d)) fout(404, 'Foto niet gevonden');
  return { f, d, slot: fotoSlotVoor(f.slot)!.slot };
}

const slotFotos = (ctx: Ctx, dossierId: number, slot: string) =>
  (ctx.db.prepare('SELECT id FROM fotos WHERE dossier_id = ? AND slot = ? AND verwijderd_at IS NULL ORDER BY created_at, rowid').all(dossierId, slot) as { id: string }[]).map((r) => r.id);

// Every slot change is logged as the list of photo IDs before and after, so it merges with other edits in Alle activiteit.
function wijzigSlot(ctx: Ctx, c: C, d: Dossier, slotKey: string, slot: FotoSlot, wijzig: () => void): string | null {
  const voor = slotFotos(ctx, d.id, slotKey);
  ctx.db.transaction(() => {
    wijzig();
    auditWijzigingen(ctx, actorVan(c), d.id, { [`fotos.${slotKey}`]: [voor, slotFotos(ctx, d.id, slotKey)] });
  })();
  return slot.inPlan ? planGewijzigd(ctx, d.id) : null;
}

async function verwerk(invoer: Buffer, maxPx: number): Promise<{ inhoud: Buffer; breedte: number; hoogte: number }> {
  try {
    const { data, info } = await sharp(invoer)
      .rotate()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { inhoud: data, breedte: info.width, hoogte: info.height };
  } catch {
    fout(400, 'Dit bestand is geen bruikbare afbeelding. Gebruik een JPG- of PNG-afbeelding.');
  }
}

function leesBbox(v: unknown, d: Dossier): Bbox {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) fout(400, 'Ongeldig kaartkader');
  const [x1, y1, x2, y2] = v as Bbox;
  const b = x2 - x1;
  const h = y2 - y1;
  if (b < BBOX_MIN_M || h < BBOX_MIN_M || b > BBOX_MAX_M || h > BBOX_MAX_M) fout(400, `Het kader moet tussen ${BBOX_MIN_M} en ${BBOX_MAX_M} meter breed en hoog zijn.`);
  if (!d.adres) fout(409, 'Kies eerst een adres.');
  if (Math.hypot((x1 + x2) / 2 - d.adres.rd[0], (y1 + y2) / 2 - d.adres.rd[1]) > BBOX_MAX_AFSTAND_M) fout(400, 'Het kader ligt te ver van het adres.');
  return [x1, y1, x2, y2];
}

// Pixel size for an RD box, keeping its aspect ratio with the longest side at `maxPx`.
function afmetingen(bbox: Bbox, maxPx: number): { w: number; h: number } {
  const b = bbox[2] - bbox[0];
  const h = bbox[3] - bbox[1];
  return b >= h ? { w: maxPx, h: Math.round((maxPx * h) / b) } : { w: Math.round((maxPx * b) / h), h: maxPx };
}

export function fotoRoutes(app: Hono<Env>, ctx: Ctx): void {
  // Raw image body. `?vervang=<id>` replaces that photo in the same slot.
  app.post('/api/dossiers/:id/fotos/:slot', async (c) => {
    const d = haalDossier(ctx, c);
    const slotKey = c.req.param('slot');
    const slot = slotVan(slotKey);
    magFotoBewerken(c, d, slot);
    const vervang = c.req.query('vervang');
    if (vervang !== undefined && !slotFotos(ctx, d.id, slotKey).includes(vervang)) fout(409, 'De foto die je wilde vervangen bestaat niet meer.');
    const invoer = Buffer.from(await c.req.arrayBuffer());
    if (invoer.length === 0) fout(400, 'Geen afbeelding ontvangen');
    if (invoer.length > MAX_UPLOAD_BYTES) fout(413, 'Deze afbeelding is te groot.');
    const { inhoud, breedte, hoogte } = await verwerk(invoer, FOTO_MAX_PX);
    const id = crypto.randomUUID();
    bewaarFoto(ctx.config, id, inhoud);
    const nu = ctx.klok.iso();
    const plan = wijzigSlot(ctx, c, d, slotKey, slot, () => {
      if (vervang !== undefined) ctx.db.prepare('UPDATE fotos SET verwijderd_at = ? WHERE id = ?').run(nu, vervang);
      ctx.db
        .prepare('INSERT INTO fotos (id, dossier_id, slot, breedte, hoogte, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, d.id, slotKey, breedte, hoogte, nu, c.get('actor').id);
    });
    const foto = fotoVan(ctx.db.prepare('SELECT * FROM fotos WHERE id = ?').get(id) as Record<string, unknown>);
    return c.json({ foto, plan_gewijzigd_at: plan }, 201);
  });

  app.get('/api/fotos/:id', (c) => {
    const { f } = haalFoto(ctx, c);
    return c.body(new Uint8Array(fs.readFileSync(fotoPad(ctx.config, f.id))), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
  });

  app.delete('/api/fotos/:id', (c) => {
    const { f, d, slot } = haalFoto(ctx, c);
    magFotoBewerken(c, d, slot);
    const plan = wijzigSlot(ctx, c, d, f.slot, slot, () => {
      ctx.db.prepare('UPDATE fotos SET verwijderd_at = ? WHERE id = ?').run(ctx.klok.iso(), f.id);
    });
    return c.json({ ok: true, plan_gewijzigd_at: plan });
  });

  // Ordinary photos take Pijl and Tekst only; the kaart's tekeningen live in the dossier data instead.
  app.put('/api/fotos/:id/annotaties', async (c) => {
    const { f, d, slot } = haalFoto(ctx, c);
    magFotoBewerken(c, d, slot);
    if (f.slot === 'kaart') fout(400, 'De tekeningen op de kaart worden bij het dossier opgeslagen');
    const { annotaties } = await body<{ annotaties: unknown }>(c);
    if (!isAnnotatieLijst(annotaties as Json) || !(annotaties as Annotatie[]).every((a) => a.type === 'pijl' || a.type === 'tekst')) fout(400, 'Ongeldige tekeningen');
    const oud = JSON.parse((ctx.db.prepare('SELECT annotaties FROM fotos WHERE id = ?').get(f.id) as { annotaties: string }).annotaties) as Json;
    if (JSON.stringify(oud) === JSON.stringify(annotaties)) return c.json({ ok: true, plan_gewijzigd_at: null });
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE fotos SET annotaties = ? WHERE id = ?').run(JSON.stringify(annotaties), f.id);
      auditWijzigingen(ctx, actorVan(c), d.id, { [`annotaties.${f.id}`]: [oud, annotaties as Json] });
    })();
    return c.json({ ok: true, plan_gewijzigd_at: slot.inPlan ? planGewijzigd(ctx, d.id) : null });
  });

  // A quick, small render of any RD box, for framing the luchtfoto.
  app.get('/api/dossiers/:id/luchtfoto', async (c) => {
    const d = haalDossier(ctx, c);
    const bbox = leesBbox(String(c.req.query('bbox')).split(',').map(Number), d);
    const { w, h } = afmetingen(bbox, LUCHTFOTO_PREVIEW_PX);
    return c.body(new Uint8Array(await luchtfoto(ctx, bbox, w, h)), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' });
  });

  // Re-requests the framed box at full resolution and stores it as the kaart, to scale. The kaart's tekeningen stay.
  app.post('/api/dossiers/:id/luchtfoto', async (c) => {
    const d = haalDossier(ctx, c);
    const slot = fotoSlotVoor('kaart')!.slot;
    magFotoBewerken(c, d, slot);
    const bbox = leesBbox((await body<{ bbox: unknown }>(c)).bbox, d);
    const { w, h } = afmetingen(bbox, LUCHTFOTO_MAX_PX);
    const inhoud = await luchtfoto(ctx, bbox, w, h);
    const id = crypto.randomUUID();
    bewaarFoto(ctx.config, id, inhoud);
    const nu = ctx.klok.iso();
    const plan = wijzigSlot(ctx, c, d, 'kaart', slot, () => {
      ctx.db.prepare("UPDATE fotos SET verwijderd_at = ? WHERE dossier_id = ? AND slot = 'kaart' AND verwijderd_at IS NULL").run(nu, d.id);
      ctx.db
        .prepare("INSERT INTO fotos (id, dossier_id, slot, breedte, hoogte, m_per_px, created_at, created_by) VALUES (?, ?, 'kaart', ?, ?, ?, ?, ?)")
        .run(id, d.id, w, h, (bbox[2] - bbox[0]) / w, nu, c.get('actor').id);
    });
    return c.json({ dossier: laadDossier(ctx.db, d.id)!, plan_gewijzigd_at: plan }, 201);
  });

  // Stores the nearest boring's profile as the boorprofiel, replacing any there, and says in boorlocatie where it is and where it came from.
  app.post('/api/dossiers/:id/boring', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    if (!d.adres) fout(409, 'Kies eerst een adres.');
    const b = await dichtsteBoring(ctx, d.adres.ll);
    if (!b) return c.json({ boring: null, dossier: d, plan_gewijzigd_at: null });
    const boorlocatie = `${await straatBij(ctx, b.ll)}: boring ${b.id} (${b.bron === 'DINO' ? 'DINOloket' : 'BROloket'}), ${b.afstand_m} m van het huis`;
    const { inhoud, breedte, hoogte } = await verwerk(b.png, FOTO_MAX_PX);
    const id = crypto.randomUUID();
    bewaarFoto(ctx.config, id, inhoud);
    const nu = ctx.klok.iso();
    const plan = wijzigSlot(ctx, c, d, 'boorprofiel', fotoSlotVoor('boorprofiel')!.slot, () => {
      ctx.db.prepare("UPDATE fotos SET verwijderd_at = ? WHERE dossier_id = ? AND slot = 'boorprofiel' AND verwijderd_at IS NULL").run(nu, d.id);
      ctx.db
        .prepare("INSERT INTO fotos (id, dossier_id, slot, breedte, hoogte, created_at, created_by) VALUES (?, ?, 'boorprofiel', ?, ?, ?, ?)")
        .run(id, d.id, breedte, hoogte, nu, c.get('actor').id);
      // Reloaded here: other fields may have been saved during the lookup above.
      const vers = laadDossier(ctx.db, d.id)!;
      ctx.db.prepare('UPDATE dossiers SET data = ? WHERE id = ?').run(JSON.stringify({ ...vers.data, boorlocatie }), d.id);
      auditWijzigingen(ctx, actorVan(c), d.id, { boorlocatie: [waarde(vers, 'boorlocatie'), boorlocatie] });
    });
    return c.json({ boring: { bron: b.bron, id: b.id, afstand_m: b.afstand_m }, dossier: laadDossier(ctx.db, d.id)!, plan_gewijzigd_at: plan }, 201);
  });
}
