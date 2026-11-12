import type { Hono } from 'hono';
import { adresRegel } from '../../shared/status.ts';
import type { Adres, Notificaties } from '../../shared/types.ts';
import { alleenBeheerder } from '../auth.ts';
import { type Ctx, type Env, body, fout } from '../context.ts';

const NOTIFICATIES_MAX = 50;

// The bell's list for one beheerder: unread first, then newest first.
function notificaties(ctx: Ctx, gebruikerId: number): Notificaties {
  const rijen = ctx.db
    .prepare(
      `SELECT n.id, n.dossier_id, n.titel, n.created_at, n.gelezen_at, d.adres_json
       FROM notificaties n JOIN dossiers d ON d.id = n.dossier_id
       WHERE n.gebruiker_id = ? ORDER BY n.gelezen_at IS NOT NULL, n.created_at DESC, n.id DESC LIMIT ?`,
    )
    .all(gebruikerId, NOTIFICATIES_MAX) as { id: number; dossier_id: number; titel: string; created_at: string; gelezen_at: string | null; adres_json: string | null }[];
  const { ongelezen, totaal } = ctx.db
    .prepare('SELECT COUNT(*) - COUNT(gelezen_at) AS ongelezen, COUNT(*) AS totaal FROM notificaties WHERE gebruiker_id = ?')
    .get(gebruikerId) as { ongelezen: number; totaal: number };
  return {
    ongelezen,
    totaal,
    items: rijen.map((r) => ({
      id: r.id, dossier_id: r.dossier_id, titel: r.titel, created_at: r.created_at, gelezen: r.gelezen_at !== null,
      adres: adresRegel({ id: r.dossier_id, adres: r.adres_json ? (JSON.parse(r.adres_json) as Adres) : null }),
    })),
  };
}

// Read state is per beheerder. Inloggen als only views as a klusser, who has no bell.
export function notificatieRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/api/notificaties', (c) => {
    alleenBeheerder(c);
    return c.json(notificaties(ctx, c.get('ik').id));
  });

  // Opening one marks every melding about that dossier as read.
  app.post('/api/notificaties/gelezen', async (c) => {
    alleenBeheerder(c);
    const { dossier_id } = await body<{ dossier_id: unknown }>(c);
    if (typeof dossier_id !== 'number') fout(400, 'Ongeldig dossier');
    const ik = c.get('ik').id;
    ctx.db.prepare('UPDATE notificaties SET gelezen_at = ? WHERE gebruiker_id = ? AND dossier_id = ? AND gelezen_at IS NULL').run(ctx.klok.iso(), ik, dossier_id);
    return c.json(notificaties(ctx, ik));
  });
}
