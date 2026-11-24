import type { Hono } from 'hono';
import { BEWAARTERMIJN_HERINNERING, NORM_CONTROLE_DAGEN } from '../../shared/constants.ts';
import { dagenSinds } from '../../shared/datum.ts';
import type { Gebruiker, Rol } from '../../shared/types.ts';
import { audit } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type Ctx, type Env, actorVan, body, fout, idParam } from '../context.ts';
import { lijstRij } from '../lijst.ts';
import { EMAIL_RE } from '../mail.ts';
import { gebruiker, gebruikersMap, laadDossiers, normafvoeren } from '../repo.ts';

export interface GebruikerRij extends Gebruiker {
  open: number;
  gesloten: number;
}

// Dossier meldingen go to the eigenaar, so an open dossier's eigenaar must stay an active beheerder.
function nogEigenaar(ctx: Ctx, g: Gebruiker): void {
  const n = (ctx.db.prepare('SELECT COUNT(*) AS n FROM dossiers WHERE eigenaar_id = ? AND gesloten_at IS NULL').get(g.id) as { n: number }).n;
  if (n > 0) fout(409, `${g.naam} is nog eigenaar van ${n} open ${n === 1 ? 'dossier' : 'dossiers'}. Kies daar eerst een andere eigenaar.`);
}

// Beheerders first, then by name; with their open and closed dossier counts as bezoeker or uitvoerder.
export function gebruikerRijen(ctx: Ctx, metGearchiveerd: boolean): GebruikerRij[] {
  const rijen = ctx.db
    .prepare(
      `SELECT g.*,
        (SELECT COUNT(*) FROM dossiers d WHERE (d.bezoeker_id = g.id OR d.uitvoerder_id = g.id) AND d.gesloten_at IS NULL) AS open,
        (SELECT COUNT(*) FROM dossiers d WHERE (d.bezoeker_id = g.id OR d.uitvoerder_id = g.id) AND d.gesloten_at IS NOT NULL) AS gesloten
       FROM gebruikers g ${metGearchiveerd ? '' : 'WHERE g.archived_at IS NULL'}
       ORDER BY g.rol = 'beheerder' DESC, g.naam COLLATE NOCASE`,
    )
    .all() as GebruikerRij[];
  return rijen;
}

interface Invoer {
  naam: string;
  email: string;
  telefoon: string | null;
  rol: Rol;
}

function leesInvoer(b: Record<string, unknown>): Invoer {
  const naam = typeof b.naam === 'string' ? b.naam.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const telefoon = typeof b.telefoon === 'string' && b.telefoon.trim() ? b.telefoon.trim() : null;
  if (!naam) fout(400, 'Vul een naam in.');
  if (!EMAIL_RE.test(email)) fout(400, 'Vul een geldig e-mailadres in.');
  if (b.rol !== 'beheerder' && b.rol !== 'klusser') fout(400, 'Kies een rol.');
  return { naam, email, telefoon, rol: b.rol };
}

function controleerUniek(ctx: Ctx, email: string, behalve: number | null): void {
  const ander = ctx.db.prepare('SELECT naam FROM gebruikers WHERE email = ? AND id IS NOT ?').get(email, behalve) as { naam: string } | undefined;
  if (ander) fout(409, `Er bestaat al een gebruiker met dit e-mailadres: ${ander.naam}.`);
}

export function gebruikerRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/api/gebruikers', (c) => {
    alleenBeheerder(c);
    return c.json({ gebruikers: gebruikerRijen(ctx, c.req.query('gearchiveerd') === '1') });
  });

  app.post('/api/gebruikers', async (c) => {
    alleenBeheerder(c);
    const inv = leesInvoer(await body(c));
    controleerUniek(ctx, inv.email, null);
    const r = ctx.db
      .prepare('INSERT INTO gebruikers (naam, email, telefoon, rol, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(inv.naam, inv.email, inv.telefoon, inv.rol, ctx.klok.iso());
    const id = Number(r.lastInsertRowid);
    audit(ctx, actorVan(c), null, 'gebruiker_aangemaakt', { gebruiker_id: id, naam: inv.naam, email: inv.email, rol: inv.rol });
    return c.json({ gebruiker: gebruiker(ctx.db, id) });
  });

  app.get('/api/gebruikers/:id', (c) => {
    alleenBeheerder(c);
    const g = gebruiker(ctx.db, idParam(c));
    if (!g) fout(404, 'Gebruiker niet gevonden');
    const gm = gebruikersMap(ctx.db);
    const nu = ctx.klok.nu();
    const ik = c.get('ik');
    const dossiers = laadDossiers(ctx.db, 'd.bezoeker_id = ? OR d.uitvoerder_id = ?', [g.id, g.id])
      .map((d) => ({ ...lijstRij(d, gm, nu, ik), rol: [d.bezoeker_id === g.id ? 'Bezoeker' : null, d.uitvoerder_id === g.id ? 'Uitvoerder' : null].filter((r) => r !== null).join(' + ') }))
      .sort((a, b) => Number(a.gesloten) - Number(b.gesloten) || b.id - a.id);
    return c.json({ gebruiker: g, dossiers });
  });

  app.patch('/api/gebruikers/:id', async (c) => {
    alleenBeheerder(c);
    const g = gebruiker(ctx.db, idParam(c));
    if (!g) fout(404, 'Gebruiker niet gevonden');
    const inv = leesInvoer(await body(c));
    if (g.id === c.get('actor').id && inv.rol !== g.rol) fout(400, 'Je kunt je eigen rol niet wijzigen.');
    if (inv.rol !== 'beheerder') nogEigenaar(ctx, g);
    controleerUniek(ctx, inv.email, g.id);
    const changes: Record<string, [string | null, string | null]> = {};
    for (const k of ['naam', 'email', 'telefoon', 'rol'] as const) if (g[k] !== inv[k]) changes[k] = [g[k], inv[k]];
    if (Object.keys(changes).length === 0) return c.json({ gebruiker: g });
    ctx.db.prepare('UPDATE gebruikers SET naam = ?, email = ?, telefoon = ?, rol = ? WHERE id = ?').run(inv.naam, inv.email, inv.telefoon, inv.rol, g.id);
    audit(ctx, actorVan(c), null, 'gebruiker_gewijzigd', { gebruiker_id: g.id, naam: inv.naam, changes });
    return c.json({ gebruiker: gebruiker(ctx.db, g.id) });
  });

  app.post('/api/gebruikers/:id/archiveren', (c) => {
    alleenBeheerder(c);
    const g = gebruiker(ctx.db, idParam(c));
    if (!g) fout(404, 'Gebruiker niet gevonden');
    if (g.id === c.get('actor').id) fout(400, 'Je kunt jezelf niet archiveren.');
    if (g.archived_at) return c.json({ gebruiker: g });
    nogEigenaar(ctx, g);
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE gebruikers SET archived_at = ? WHERE id = ?').run(ctx.klok.iso(), g.id);
      ctx.db.prepare('DELETE FROM sessies WHERE gebruiker_id = ?').run(g.id);
    })();
    audit(ctx, actorVan(c), null, 'gebruiker_gearchiveerd', { gebruiker_id: g.id, naam: g.naam });
    return c.json({ gebruiker: gebruiker(ctx.db, g.id) });
  });

  app.post('/api/gebruikers/:id/dearchiveren', (c) => {
    alleenBeheerder(c);
    const g = gebruiker(ctx.db, idParam(c));
    if (!g) fout(404, 'Gebruiker niet gevonden');
    if (!g.archived_at) return c.json({ gebruiker: g });
    ctx.db.prepare('UPDATE gebruikers SET archived_at = NULL WHERE id = ?').run(g.id);
    audit(ctx, actorVan(c), null, 'gebruiker_gedearchiveerd', { gebruiker_id: g.id, naam: g.naam });
    return c.json({ gebruiker: gebruiker(ctx.db, g.id) });
  });

  app.get('/api/overzicht', (c) => {
    alleenBeheerder(c);
    const gm = gebruikersMap(ctx.db);
    const nu = ctx.klok.nu();
    const ik = c.get('ik');
    const rijen = laadDossiers(ctx.db).map((d) => lijstRij(d, gm, nu, ik));
    const open = rijen.filter((r) => !r.gesloten);
    // Each count's `query` opens the dossiers list filtered to exactly those dossiers.
    const tellingen = [
      { key: 'open', label: 'Open dossiers', aantal: open.length, query: '' },
      { key: 'aandacht', label: 'Aandacht nodig', aantal: open.filter((r) => r.aandacht).length, query: 'aandacht=1' },
      { key: 'bezoek', label: 'Wacht op bezoek', aantal: open.filter((r) => r.stapNr >= 3 && r.stapNr <= 4).length, query: 'stap=3-4' },
      { key: 'corporatie', label: 'Wacht op woningcorporatie', aantal: open.filter((r) => r.ligtBij === 'corporatie').length, query: 'ligt_bij=corporatie' },
      { key: 'gesloten', label: 'Gesloten', aantal: rijen.length - open.length, query: 's_gesloten=ja' },
      { key: 'uitgevoerd', label: 'Uitgevoerd', aantal: rijen.filter((r) => r.uitgevoerd).length, query: 's_gesloten=alle&s_uitgevoerd=ja' },
    ];
    const normNakijken = normafvoeren(ctx.db).filter((n) => dagenSinds(n.gecontroleerd_at, nu) >= NORM_CONTROLE_DAGEN);
    const bewaartermijnRegelen = nu >= new Date(BEWAARTERMIJN_HERINNERING);
    return c.json({ tellingen, gebruikers: gebruikerRijen(ctx, false), normNakijken, bewaartermijnRegelen, proefomgeving: ctx.config.proefomgeving });
  });
}
