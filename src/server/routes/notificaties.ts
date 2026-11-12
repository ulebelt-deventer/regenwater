import type { Hono } from 'hono';
import { adresRegel } from '../../shared/status.ts';
import type { Adres, Notificatie, NotificatieSoort, Notificaties } from '../../shared/types.ts';
import { alleenBeheerder } from '../auth.ts';
import { type Ctx, type Env, body, fout, idParam } from '../context.ts';

const NOTIFICATIES_MAX = 50;

// The soorten whose full titel the dossier page shows on top until clicked away: nothing else on that page tells the reden or the failed address.
const OP_DOSSIER: NotificatieSoort[] = ['ijskast', 'mail_mislukt'];

const KOLOMMEN = 'n.id, n.dossier_id, n.soort, n.titel, n.created_at, n.gelezen_at, d.adres_json FROM notificaties n JOIN dossiers d ON d.id = n.dossier_id';
type Rij = { id: number; dossier_id: number; soort: NotificatieSoort; titel: string; created_at: string; gelezen_at: string | null; adres_json: string | null };

function notificatie(r: Rij): Notificatie {
  return {
    id: r.id, dossier_id: r.dossier_id, soort: r.soort, titel: r.titel, created_at: r.created_at, gelezen: r.gelezen_at !== null,
    adres: adresRegel({ id: r.dossier_id, adres: r.adres_json ? (JSON.parse(r.adres_json) as Adres) : null }),
  };
}

// The bell's list for one beheerder: unread first, then newest first.
function notificaties(ctx: Ctx, gebruikerId: number): Notificaties {
  const rijen = ctx.db
    .prepare(`SELECT ${KOLOMMEN} WHERE n.gebruiker_id = ? ORDER BY n.gelezen_at IS NOT NULL, n.created_at DESC, n.id DESC LIMIT ?`)
    .all(gebruikerId, NOTIFICATIES_MAX) as Rij[];
  const { ongelezen, totaal } = ctx.db
    .prepare('SELECT COUNT(*) - COUNT(gelezen_at) AS ongelezen, COUNT(*) AS totaal FROM notificaties WHERE gebruiker_id = ?')
    .get(gebruikerId) as { ongelezen: number; totaal: number };
  return { ongelezen, totaal, items: rijen.map(notificatie) };
}

// One beheerder's meldingen on top of one dossier's page, newest first.
function opDossier(ctx: Ctx, gebruikerId: number, dossierId: number): Notificatie[] {
  const rijen = ctx.db
    .prepare(`SELECT ${KOLOMMEN} WHERE n.gebruiker_id = ? AND n.dossier_id = ? AND n.weggeklikt_at IS NULL AND n.soort IN (${OP_DOSSIER.map(() => '?').join(', ')}) ORDER BY n.created_at DESC, n.id DESC`)
    .all(gebruikerId, dossierId, ...OP_DOSSIER) as Rij[];
  return rijen.map(notificatie);
}

// Read and clicked-away state is per beheerder. Inloggen als only views as a klusser, who has no meldingen.
export function notificatieRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/api/notificaties', (c) => {
    alleenBeheerder(c);
    return c.json(notificaties(ctx, c.get('ik').id));
  });

  // Opening the dossier, from the bell or anywhere else, marks every melding about it as read.
  app.post('/api/notificaties/gelezen', async (c) => {
    alleenBeheerder(c);
    const { dossier_id } = await body<{ dossier_id: unknown }>(c);
    if (typeof dossier_id !== 'number') fout(400, 'Ongeldig dossier');
    const ik = c.get('ik').id;
    ctx.db.prepare('UPDATE notificaties SET gelezen_at = ? WHERE gebruiker_id = ? AND dossier_id = ? AND gelezen_at IS NULL').run(ctx.klok.iso(), ik, dossier_id);
    return c.json(notificaties(ctx, ik));
  });

  app.get('/api/notificaties/dossier/:id', (c) => {
    alleenBeheerder(c);
    return c.json(opDossier(ctx, c.get('ik').id, idParam(c)));
  });

  // Takes the melding off the dossier page only: it stays in the bell.
  app.post('/api/notificaties/:id/wegklikken', (c) => {
    alleenBeheerder(c);
    const ik = c.get('ik').id;
    const n = ctx.db.prepare('SELECT dossier_id FROM notificaties WHERE id = ? AND gebruiker_id = ?').get(idParam(c), ik) as { dossier_id: number } | undefined;
    if (!n) fout(404, 'Melding niet gevonden');
    ctx.db.prepare('UPDATE notificaties SET weggeklikt_at = ? WHERE id = ? AND weggeklikt_at IS NULL').run(ctx.klok.iso(), idParam(c));
    return c.json(opDossier(ctx, ik, n.dossier_id));
  });
}
