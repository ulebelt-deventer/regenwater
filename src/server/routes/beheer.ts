import type { Hono } from 'hono';
import { NIEUWS } from '../../shared/nieuws.ts';
import { SJABLONEN, TAG_UITLEG, controleerTags } from '../../shared/sjablonen.ts';
import type { Adres } from '../../shared/types.ts';
import { audit, type AuditRij } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type Ctx, type Env, actorVan, body, fout, idParam } from '../context.ts';
import { melding } from '../meldingen.ts';
import { gebruikersMap } from '../repo.ts';
import { auditItem } from './dossiers.ts';

const ACTIVITEIT_PER_PAGINA = 50;
const FEEDBACK_MAX_TEKENS = 5000;

interface MateriaalRij {
  id: number;
  volgorde: number;
  naam: string;
  prijs: number;
}

function leesMateriaal(b: Record<string, unknown>): { naam: string; prijs: number } {
  const naam = typeof b.naam === 'string' ? b.naam.trim() : '';
  if (!naam) fout(400, 'Vul een naam in.');
  if (typeof b.prijs !== 'number' || !Number.isInteger(b.prijs) || b.prijs < 0) fout(400, 'Vul een geldige prijs in.');
  return { naam, prijs: b.prijs };
}

const materialen = (ctx: Ctx) => ctx.db.prepare('SELECT * FROM materialen ORDER BY volgorde, id').all() as MateriaalRij[];

export function beheerRoutes(app: Hono<Env>, ctx: Ctx): void {
  // Materialen: the prefill for new dossiers' Materialen tables. Prices in cents.
  app.get('/api/materialen', (c) => {
    alleenBeheerder(c);
    return c.json({ materialen: materialen(ctx) });
  });

  app.post('/api/materialen', async (c) => {
    alleenBeheerder(c);
    const m = leesMateriaal(await body(c));
    const { volgorde } = ctx.db.prepare('SELECT COALESCE(MAX(volgorde), 0) + 1 AS volgorde FROM materialen').get() as { volgorde: number };
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO materialen (volgorde, naam, prijs) VALUES (?, ?, ?)').run(volgorde, m.naam, m.prijs);
    audit(ctx, actorVan(c), null, 'materiaal_toegevoegd', { id: Number(lastInsertRowid), ...m });
    return c.json({ materialen: materialen(ctx) }, 201);
  });

  app.put('/api/materialen/volgorde', async (c) => {
    alleenBeheerder(c);
    const { ids } = await body<{ ids: unknown }>(c);
    const huidig = materialen(ctx).map((m) => m.id);
    if (!Array.isArray(ids) || ids.length !== huidig.length || [...ids].sort((a, b) => a - b).join() !== [...huidig].sort((a, b) => a - b).join()) {
      fout(409, 'De lijst is intussen gewijzigd. Herlaad de pagina.');
    }
    const zet = ctx.db.prepare('UPDATE materialen SET volgorde = ? WHERE id = ?');
    ctx.db.transaction(() => (ids as number[]).forEach((id, i) => zet.run(i + 1, id)))();
    audit(ctx, actorVan(c), null, 'materialen_volgorde', { ids: ids as number[] });
    return c.json({ materialen: materialen(ctx) });
  });

  app.patch('/api/materialen/:id', async (c) => {
    alleenBeheerder(c);
    const id = idParam(c);
    const oud = ctx.db.prepare('SELECT * FROM materialen WHERE id = ?').get(id) as MateriaalRij | undefined;
    if (!oud) fout(404, 'Materiaal niet gevonden');
    const m = leesMateriaal(await body(c));
    ctx.db.prepare('UPDATE materialen SET naam = ?, prijs = ? WHERE id = ?').run(m.naam, m.prijs, id);
    audit(ctx, actorVan(c), null, 'materiaal_gewijzigd', { id, oud: { naam: oud.naam, prijs: oud.prijs }, nieuw: m });
    return c.json({ materialen: materialen(ctx) });
  });

  app.delete('/api/materialen/:id', (c) => {
    alleenBeheerder(c);
    const id = idParam(c);
    const oud = ctx.db.prepare('SELECT * FROM materialen WHERE id = ?').get(id) as MateriaalRij | undefined;
    if (!oud) fout(404, 'Materiaal niet gevonden');
    ctx.db.prepare('DELETE FROM materialen WHERE id = ?').run(id);
    audit(ctx, actorVan(c), null, 'materiaal_verwijderd', { id, naam: oud.naam, prijs: oud.prijs });
    return c.json({ materialen: materialen(ctx) });
  });

  // E-mailsjablonen. Tag problems don't block saving; they come back so the page can warn, as the preview pop-up does.
  app.get('/api/sjablonen', (c) => {
    alleenBeheerder(c);
    const opgeslagen = new Map((ctx.db.prepare('SELECT * FROM sjablonen').all() as { key: string; onderwerp: string; tekst: string }[]).map((r) => [r.key, r]));
    return c.json({
      sjablonen: SJABLONEN.map((s) => {
        const { onderwerp, tekst } = opgeslagen.get(s.key)!;
        return { key: s.key, naam: s.naam, ontvanger: s.ontvanger, tags: s.tags, verplicht: s.verplicht, onderwerp, tekst };
      }),
      uitleg: TAG_UITLEG,
    });
  });

  app.put('/api/sjablonen/:key', async (c) => {
    alleenBeheerder(c);
    const def = SJABLONEN.find((s) => s.key === c.req.param('key'));
    if (!def) fout(404, 'Onbekend sjabloon');
    const b = await body<Record<string, unknown>>(c);
    const onderwerp = typeof b.onderwerp === 'string' ? b.onderwerp.trim() : '';
    const tekst = typeof b.tekst === 'string' ? b.tekst : '';
    if (def.ontvanger !== null && !onderwerp) fout(400, 'Het onderwerp mag niet leeg zijn.');
    if (!tekst.trim()) fout(400, 'De tekst mag niet leeg zijn.');
    const oud = ctx.db.prepare('SELECT onderwerp, tekst FROM sjablonen WHERE key = ?').get(def.key) as { onderwerp: string; tekst: string };
    ctx.db.prepare('UPDATE sjablonen SET onderwerp = ?, tekst = ? WHERE key = ?').run(onderwerp, tekst, def.key);
    audit(ctx, actorVan(c), null, 'sjabloon_gewijzigd', { sjabloon: def.key, oud, nieuw: { onderwerp, tekst } });
    return c.json({ ok: true, problemen: controleerTags(def, onderwerp, tekst) });
  });

  // Feedback from anyone; each item mails the feedback recipients.
  app.post('/api/feedback', async (c) => {
    const b = await body<Record<string, unknown>>(c);
    const tekst = typeof b.tekst === 'string' ? b.tekst.trim() : '';
    const scherm = typeof b.scherm === 'string' ? b.scherm.slice(0, 500) : '';
    if (!tekst) fout(400, 'Schrijf eerst je feedback.');
    if (tekst.length > FEEDBACK_MAX_TEKENS) fout(400, 'Je feedback is te lang.');
    const ik = c.get('actor');
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO feedback (created_at, gebruiker_id, scherm, tekst) VALUES (?, ?, ?, ?)').run(ctx.klok.iso(), ik.id, scherm, tekst);
    audit(ctx, actorVan(c), null, 'feedback', { id: Number(lastInsertRowid), scherm });
    const onderwerp = `Feedback van ${ik.naam}`;
    const inhoud = `${ik.naam} (${ik.email}) op ${ctx.config.basisUrl}${scherm}:\n\n${tekst}\n\nAlle feedback: ${ctx.config.basisUrl}/beheer/feedback`;
    await melding(ctx, 'feedback', onderwerp, inhoud, null);
    return c.json({ ok: true }, 201);
  });

  app.get('/api/feedback', (c) => {
    alleenBeheerder(c);
    const alle = c.req.query('alle') === '1';
    const rijen = ctx.db.prepare(`SELECT * FROM feedback ${alle ? '' : 'WHERE afgehandeld_at IS NULL'} ORDER BY id DESC`).all();
    const gm = gebruikersMap(ctx.db);
    return c.json({ feedback: rijen, gebruikers: Object.fromEntries([...gm].map(([id, g]) => [id, g.naam])) });
  });

  app.post('/api/feedback/:id/afgehandeld', async (c) => {
    alleenBeheerder(c);
    const id = idParam(c);
    const { afgehandeld } = await body<{ afgehandeld: unknown }>(c);
    if (typeof afgehandeld !== 'boolean') fout(400, 'Ongeldig verzoek');
    const r = ctx.db
      .prepare('UPDATE feedback SET afgehandeld_at = ?, afgehandeld_by = ? WHERE id = ?')
      .run(afgehandeld ? ctx.klok.iso() : null, afgehandeld ? c.get('actor').id : null, id);
    if (r.changes === 0) fout(404, 'Feedback niet gevonden');
    return c.json({ ok: true });
  });

  app.post('/api/nieuws/gezien', (c) => {
    alleenBeheerder(c);
    ctx.db.prepare('UPDATE gebruikers SET nieuws_gezien = ? WHERE id = ?').run(NIEUWS[0].datum, c.get('ik').id);
    return c.json({ ok: true });
  });

  // Alle activiteit, newest first. `voor` is the cursor: the lowest audit id of the previous page.
  app.get('/api/activiteit', (c) => {
    alleenBeheerder(c);
    const waar: string[] = [];
    const params: (string | number)[] = [];
    const getal = (naam: string) => {
      const v = c.req.query(naam);
      if (v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) fout(400, `Ongeldige waarde voor ${naam}`);
      return n;
    };
    const voor = getal('voor');
    const actor = getal('actor');
    const dossier = getal('dossier');
    const type = c.req.query('type');
    const voeg = (sql: string, ...p: (string | number)[]) => {
      waar.push(sql);
      params.push(...p);
    };
    if (voor !== null) voeg('id < ?', voor);
    // A klusser's activity includes what an admin did while viewing the app as them.
    if (actor !== null) voeg('(actor_id = ? OR impersonated_user_id = ?)', actor, actor);
    // A deleted dossier's events are gone; its `dossier_verwijderd` event keeps the id in the payload.
    if (dossier !== null) voeg("(dossier_id = ? OR json_extract(payload, '$.dossier_id') = ?)", dossier, dossier);
    if (type) voeg('type = ?', type);
    const rijen = ctx.db
      .prepare(`SELECT * FROM audit ${waar.length ? `WHERE ${waar.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...params, ACTIVITEIT_PER_PAGINA + 1) as AuditRij[];
    const meer = rijen.length > ACTIVITEIT_PER_PAGINA;
    const pagina = rijen.slice(0, ACTIVITEIT_PER_PAGINA);
    const ids = [...new Set(pagina.map((r) => r.dossier_id).filter((id) => id !== null))];
    const adressen = Object.fromEntries(
      ids.map((id) => {
        const r = ctx.db.prepare('SELECT adres_json FROM dossiers WHERE id = ?').get(id) as { adres_json: string | null } | undefined;
        return [id, r && r.adres_json ? (JSON.parse(r.adres_json) as Adres) : null];
      }),
    );
    const gm = gebruikersMap(ctx.db);
    return c.json({
      items: pagina.map(auditItem),
      volgende: meer ? pagina[pagina.length - 1].id : null,
      adressen,
      gebruikers: Object.fromEntries([...gm].map(([id, g]) => [id, g.naam])),
      types: (ctx.db.prepare('SELECT DISTINCT type FROM audit ORDER BY type').all() as { type: string }[]).map((r) => r.type),
    });
  });
}
