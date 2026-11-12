import fs from 'node:fs';
import type { Hono } from 'hono';
import { KAART_MELDINGEN, aandacht, klusserHerinnering } from '../../shared/aandacht.ts';
import { isoDatum } from '../../shared/datum.ts';
import { kaartItems } from '../../shared/kaart.ts';
import { DOSSIERS_PER_PAGINA } from '../../shared/constants.ts';
import { isBeheerder, magBewerken, magMijlpaal, magZien } from '../../shared/rechten.ts';
import { STATUS_FILTERS, adresRegel, inIjskast } from '../../shared/status.ts';
import { MIJLPALEN, type Dossier, type Gebruiker, type Json, type Mijlpaal, type Ontvanger, type RioolDetectie, SLUIT_REDENEN, type SluitReden } from '../../shared/types.ts';
import { materiaalRijen, nieuwId, veldVoor, waarde } from '../../shared/velden.ts';
import { audit, auditWijzigingen, type AuditRij } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type C, type Ctx, type Env, actorVan, body, fout, idParam } from '../context.ts';
import { SORTERINGEN, csvExport, filter, leesFilters, lijstRij, sorteer } from '../lijst.ts';
import { fotoPad } from '../fotos.ts';
import { log } from '../log.ts';
import { dossierMelding } from '../meldingen.ts';
import { suggesties, zoekAdres } from '../pdok.ts';
import { gebruiker, gebruikersMap, laadDossier, laadDossiers, leesNormMm } from '../repo.ts';
import { detecteerRiool } from '../riool.ts';
import { controleerWaarde } from '../veldwaarde.ts';

const KOLOM_VELDEN = new Set(['huur_koop', 'afspraak', 'uitvoering_gepland']);

export function haalDossier(ctx: Ctx, c: C): Dossier {
  const d = laadDossier(ctx.db, idParam(c));
  if (!d || !magZien(c.get('ik'), d)) fout(404, 'Dossier niet gevonden');
  return d;
}

export function nietGesloten(d: Dossier): void {
  if (d.gesloten_at) fout(409, 'Dit dossier is gesloten. Heropen het om iets te wijzigen.');
}

export function planGewijzigd(ctx: Ctx, id: number): string {
  const nu = ctx.klok.iso();
  ctx.db.prepare('UPDATE dossiers SET plan_gewijzigd_at = ? WHERE id = ?').run(nu, id);
  return nu;
}

// Klussers see names only: e-mail and telefoon of other users are for admins.
function gebruikersVoor(ik: Gebruiker, gm: Map<number, Gebruiker>): Partial<Gebruiker>[] {
  const alle = [...gm.values()];
  if (isBeheerder(ik)) return alle;
  return alle.map((g) => ({ id: g.id, naam: g.naam, rol: g.rol, archived_at: g.archived_at }));
}

// Other dossiers at the same address, for the "dubbel?" warning.
function dubbel(ctx: Ctx, d: Dossier): { id: number; gesloten: boolean }[] {
  if (!d.adres) return [];
  const a = d.adres;
  return (
    ctx.db
      .prepare('SELECT id, gesloten_at FROM dossiers WHERE postcode = ? AND huisnummer = ? AND huisletter IS ? AND toevoeging IS ? AND id != ? ORDER BY id')
      .all(a.postcode, a.huisnummer, a.huisletter, a.toevoeging, d.id) as { id: number; gesloten_at: string | null }[]
  ).map((r) => ({ id: r.id, gesloten: r.gesloten_at !== null }));
}

function tekstVeld(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  return typeof v === 'string' ? v.trim() : '';
}

// From here on the dossier keeps this norm, whatever happens to the Normafvoer table.
function zetNormVast(ctx: Ctx, c: C, d: Dossier): void {
  if (d.normafvoer.vast_at) return;
  const { mm, gemeente } = d.normafvoer;
  ctx.db.prepare('UPDATE dossiers SET normafvoer_mm = ?, normafvoer_gemeente = ?, normafvoer_at = ? WHERE id = ?').run(mm, gemeente, ctx.klok.iso(), d.id);
  audit(ctx, actorVan(c), d.id, 'normafvoer_vastgezet', { mm, gemeente });
}

export function dossierRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/api/dossiers', (c) => {
    const ik = c.get('ik');
    const gm = gebruikersMap(ctx.db);
    const nu = ctx.klok.nu();
    const beheerder = isBeheerder(ik);
    const alle = beheerder ? laadDossiers(ctx.db) : laadDossiers(ctx.db, 'd.bezoeker_id = ? OR d.uitvoerder_id = ?', [ik.id, ik.id]);
    const rijen = new Map(alle.map((d) => [d.id, lijstRij(d, gm, nu, ik)]));
    const f = leesFilters(c.req.query());
    let gesorteerd = sorteer(filter(alle, rijen, f, nu).map((d) => rijen.get(d.id)!), f.sorteer, nu);
    // A klusser's own turn comes first, keeping the chosen order within each group.
    if (!beheerder) gesorteerd = [...gesorteerd.filter((r) => r.opdracht!.aanZet), ...gesorteerd.filter((r) => !r.opdracht!.aanZet)];
    const paginas = Math.max(1, Math.ceil(gesorteerd.length / DOSSIERS_PER_PAGINA));
    const pagina = Math.min(paginas, Math.max(1, Number(c.req.query('pagina')) || 1));
    const open = [...rijen.values()].filter((r) => !r.gesloten);
    const plaatsen = [...new Set(alle.flatMap((d) => (d.adres ? [d.adres.plaats] : [])))].sort((a, b) => a.localeCompare(b, 'nl'));
    return c.json({
      rijen: gesorteerd.slice((pagina - 1) * DOSSIERS_PER_PAGINA, pagina * DOSSIERS_PER_PAGINA),
      totaal: gesorteerd.length,
      pagina,
      paginas,
      stats: beheerder ? { open: open.length, aandacht: open.filter((r) => r.aandacht).length, uitgevoerd: [...rijen.values()].filter((r) => r.uitgevoerd).length } : null,
      opties: {
        plaatsen,
        klussers: beheerder ? [...gm.values()].filter((g) => !g.archived_at).map((g) => ({ id: g.id, naam: g.naam })) : [],
        beheerders: beheerder ? [...gm.values()].filter((g) => !g.archived_at && isBeheerder(g)).map((g) => ({ id: g.id, naam: g.naam })) : [],
        statusFilters: STATUS_FILTERS.map((s) => ({ key: s.key, label: s.label, standaard: s.standaard })),
        sorteringen: SORTERINGEN,
      },
    });
  });

  app.get('/api/dossiers.csv', (c) => {
    alleenBeheerder(c);
    const ik = c.get('ik');
    const gm = gebruikersMap(ctx.db);
    const nu = ctx.klok.nu();
    const alle = laadDossiers(ctx.db);
    const rijen = new Map(alle.map((d) => [d.id, lijstRij(d, gm, nu, ik)]));
    const f = leesFilters(c.req.query());
    const volgorde = sorteer(filter(alle, rijen, f, nu).map((d) => rijen.get(d.id)!), f.sorteer, nu);
    const perId = new Map(alle.map((d) => [d.id, d]));
    const naam = `dossiers-${nu.toISOString().slice(0, 10)}.csv`;
    return c.body(csvExport(volgorde.map((r) => perId.get(r.id)!), rijen), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${naam}"`,
    });
  });

  app.post('/api/dossiers', (c) => {
    alleenBeheerder(c);
    const data: Record<string, Json> = {};
    const ids: string[] = [];
    for (const m of ctx.db.prepare('SELECT naam, prijs FROM materialen ORDER BY volgorde, id').all() as { naam: string; prijs: number }[]) {
      const id = nieuwId();
      ids.push(id);
      data[`materiaal.${id}.naam`] = m.naam;
      data[`materiaal.${id}.prijs`] = m.prijs;
    }
    if (ids.length) data.materialen = ids;
    const ik = c.get('ik').id;
    const r = ctx.db.prepare('INSERT INTO dossiers (created_at, created_by, eigenaar_id, data) VALUES (?, ?, ?, ?)').run(ctx.klok.iso(), ik, ik, JSON.stringify(data));
    const id = Number(r.lastInsertRowid);
    audit(ctx, actorVan(c), id, 'dossier_aangemaakt');
    return c.json({ id });
  });

  app.get('/api/dossiers/:id', (c) => {
    const ik = c.get('ik');
    const d = haalDossier(ctx, c);
    const gm = gebruikersMap(ctx.db);
    const nu = ctx.klok.nu();
    const h = isBeheerder(ik) ? null : klusserHerinnering(d, ik.id, gm, nu);
    return c.json({
      dossier: d,
      gebruikers: gebruikersVoor(ik, gm),
      nu: nu.toISOString(),
      dubbel: isBeheerder(ik) ? dubbel(ctx, d) : [],
      aandacht: isBeheerder(ik) ? aandacht(d, gm, nu) : null,
      herinnering: h,
    });
  });

  // Autosave: one key per request, so concurrent edits of different fields never overwrite each other.
  app.patch('/api/dossiers/:id', async (c) => {
    const ik = c.get('ik');
    // The body is read first: an await between loading the data and writing it back would let a concurrent save of another field be overwritten.
    const b = await body<{ key: unknown; value: unknown }>(c);
    const d = haalDossier(ctx, c);
    if (typeof b.key !== 'string') fout(400, 'Ongeldig verzoek');
    const key = b.key;
    const gevonden = veldVoor(key);
    if (!gevonden) fout(400, `Onbekend veld: ${key}`);
    const { veld, anders } = gevonden;
    nietGesloten(d);
    if (!magBewerken(ik, d, veld.bewerkers)) fout(403, 'Je kunt dit veld niet (meer) wijzigen. Vraag een beheerder.');
    const nieuw = controleerWaarde(veld, anders, (b.value === undefined ? null : b.value) as Json);
    const oud = waarde(d, key);
    const wijzigt = JSON.stringify(oud) !== JSON.stringify(nieuw);
    let planAt = d.plan_gewijzigd_at;
    if (wijzigt) {
      ctx.db.transaction(() => {
        if (KOLOM_VELDEN.has(key)) {
          ctx.db.prepare(`UPDATE dossiers SET ${key} = ? WHERE id = ?`).run(nieuw, d.id);
        } else {
          const data = { ...d.data };
          if (nieuw === null) delete data[key];
          else data[key] = nieuw;
          ctx.db.prepare('UPDATE dossiers SET data = ? WHERE id = ?').run(JSON.stringify(data), d.id);
        }
        if (veld.inPlan) planAt = planGewijzigd(ctx, d.id);
        auditWijzigingen(ctx, actorVan(c), d.id, { [key]: [oud, nieuw] });
      })();
    }
    return c.json({ ok: true, opgeslagen_at: ctx.klok.iso(), plan_gewijzigd_at: planAt });
  });

  app.get('/api/adres/suggest', async (c) => {
    alleenBeheerder(c);
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json({ suggesties: [] });
    return c.json({ suggesties: await suggesties(ctx, q) });
  });

  app.post('/api/dossiers/:id/adres', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const { id } = await body<{ id: unknown }>(c);
    if (typeof id !== 'string') fout(400, 'Ongeldig verzoek');
    const a = await zoekAdres(ctx, id);
    // A broken rioolkaart must not block choosing the address: the failure is stored and shown where the detection would be.
    const riool: RioolDetectie = await detecteerRiool(ctx, a).catch((e: unknown) => {
      log.error(`rioolstelsel detecteren voor dossier ${d.id} (${a.gemeente}) mislukt`, e);
      return { soort: 'fout', bericht: e instanceof Error ? e.message : String(e), at: ctx.klok.iso() };
    });
    // Re-read: the lookups above awaited, and another request may have changed extra_json meanwhile.
    const extra = { ...laadDossier(ctx.db, d.id)!.extra, riool };
    ctx.db.transaction(() => {
      ctx.db
        .prepare('UPDATE dossiers SET straat = ?, huisnummer = ?, huisletter = ?, toevoeging = ?, postcode = ?, plaats = ?, gemeente = ?, adres_json = ?, extra_json = ? WHERE id = ?')
        .run(a.straat, a.huisnummer, a.huisletter, a.toevoeging, a.postcode, a.plaats, a.gemeente, JSON.stringify(a), JSON.stringify(extra), d.id);
      planGewijzigd(ctx, d.id);
      auditWijzigingen(ctx, actorVan(c), d.id, { adres: [d.adres ? adresRegel(d) : null, adresRegel({ ...d, adres: a })] });
    })();
    const nieuw = laadDossier(ctx.db, d.id)!;
    return c.json({ dossier: nieuw, dubbel: dubbel(ctx, nieuw) });
  });

  app.post('/api/dossiers/:id/mijlpaal', async (c) => {
    const ik = c.get('ik');
    // Body first, as in the autosave: a double tap must see the first tap's milestone.
    const b = await body<{ mijlpaal: unknown; aan: unknown }>(c);
    const d = haalDossier(ctx, c);
    const m = b.mijlpaal as Mijlpaal;
    const handmatig: Mijlpaal[] = ['inschrijving_afgerond', 'bezoek_afgerond', 'klaar_voor_controle', 'corporatie_akkoord', 'klussendienst_gekozen', 'werk_opgeleverd'];
    if (!MIJLPALEN.includes(m) || !handmatig.includes(m)) fout(400, 'Onbekende mijlpaal');
    nietGesloten(d);
    const at = `${m}_at` as const;
    const by = `${m}_by` as const;
    if (b.aan === false) {
      alleenBeheerder(c);
      if (d[at] === null) return c.json({ dossier: d });
      ctx.db.prepare(`UPDATE dossiers SET ${at} = NULL, ${by} = NULL WHERE id = ?`).run(d.id);
      audit(ctx, actorVan(c), d.id, 'mijlpaal', { mijlpaal: m, aan: false });
      return c.json({ dossier: laadDossier(ctx.db, d.id)! });
    }
    if ((m === 'corporatie_akkoord' && d.huur_koop !== 'huur') || (m === 'klussendienst_gekozen' && d.huur_koop !== 'koop')) fout(400, 'Deze stap hoort niet bij dit soort woning.');
    // Already set is checked first: setting Klaar voor controle ends the bezoeker's rights, so a repeat tap would otherwise be refused.
    if (d[at] !== null) return c.json({ dossier: d });
    if (!magMijlpaal(ik, d, m)) fout(403, 'Je kunt deze stap niet (meer) registreren. Vraag een beheerder.');
    ctx.db.prepare(`UPDATE dossiers SET ${at} = ?, ${by} = ? WHERE id = ?`).run(ctx.klok.iso(), ik.id, d.id);
    audit(ctx, actorVan(c), d.id, 'mijlpaal', { mijlpaal: m, aan: true });
    // The opening's own request can get lost on a bad connection on site.
    if (m === 'bezoek_afgerond') zetNormVast(ctx, c, d);
    // Only a klusser's hand-off alerts the eigenaar; an admin registering it themselves already knows. "Inloggen als" counts as the klusser, so it can be tested.
    if (ik.rol === 'klusser' && (m === 'klaar_voor_controle' || m === 'werk_opgeleverd')) {
      dossierMelding(ctx, d, `${m === 'klaar_voor_controle' ? 'Plan van Aanpak klaar voor controle' : 'Werk opgeleverd'} (${ik.naam})`, null);
    }
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/bezoek-geopend', (c) => {
    const d = haalDossier(ctx, c);
    if (d.gesloten_at) return c.json({ dossier: d });
    zetNormVast(ctx, c, d);
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  // A beheerder's override for one dossier. It changes what the Plan says, so it flags the Plan like any other change.
  app.post('/api/dossiers/:id/normafvoer', async (c) => {
    alleenBeheerder(c);
    const b = await body<Record<string, unknown>>(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const mm = leesNormMm(b);
    const reden = tekstVeld(b, 'reden');
    if (!reden) fout(400, 'Vul een reden in.');
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE dossiers SET normafvoer_mm = ?, normafvoer_gemeente = ?, normafvoer_reden = ?, normafvoer_at = ? WHERE id = ?').run(mm, d.normafvoer.gemeente, reden, ctx.klok.iso(), d.id);
      planGewijzigd(ctx, d.id);
      audit(ctx, actorVan(c), d.id, 'normafvoer_aangepast', { oud: d.normafvoer.mm, nieuw: mm, reden });
    })();
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  // Prefills Gebruikte materialen from the planned rows with an Aantal, once, when the Uitvoering page first opens.
  app.post('/api/dossiers/:id/gebruikt-vullen', (c) => {
    const d = haalDossier(ctx, c);
    if (d.data.gebruikt !== undefined || d.gesloten_at || !magBewerken(c.get('ik'), d, ['uitvoerder'])) return c.json({ dossier: d });
    const data = { ...d.data };
    const ids: string[] = [];
    for (const r of materiaalRijen(d, 'materialen')) {
      if (r.aantal === null || r.aantal === 0) continue;
      const id = nieuwId();
      ids.push(id);
      data[`gebruikt.${id}.naam`] = r.naam;
      if (r.prijs !== null) data[`gebruikt.${id}.prijs`] = r.prijs;
      data[`gebruikt.${id}.aantal`] = r.aantal;
    }
    data.gebruikt = ids;
    ctx.db.prepare('UPDATE dossiers SET data = ? WHERE id = ?').run(JSON.stringify(data), d.id);
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/toewijzen', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const b = await body<{ rol: unknown; gebruiker_id: unknown }>(c);
    if (b.rol !== 'bezoeker' && b.rol !== 'uitvoerder') fout(400, 'Ongeldige rol');
    const rol = b.rol;
    let doel: Gebruiker | null = null;
    if (b.gebruiker_id !== null) {
      doel = typeof b.gebruiker_id === 'number' ? gebruiker(ctx.db, b.gebruiker_id) : null;
      if (!doel || doel.archived_at) fout(400, 'Kies een actieve gebruiker.');
    }
    const huidig = d[`${rol}_id`];
    if (huidig === (doel ? doel.id : null)) return c.json({ dossier: d });
    const nu = ctx.klok.iso();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`UPDATE dossiers SET ${rol}_id = ?, ${rol}_toegewezen_at = ?, ${rol}_toegewezen_by = ? WHERE id = ?`)
        .run(doel ? doel.id : null, doel ? nu : null, doel ? c.get('ik').id : null, d.id);
      // The bezoeker's name is in the plan ("Schouw door").
      if (rol === 'bezoeker') planGewijzigd(ctx, d.id);
      const gm = gebruikersMap(ctx.db);
      audit(ctx, actorVan(c), d.id, 'toegewezen', { rol, van: huidig === null ? null : gm.get(huidig)!.naam, naar: doel ? doel.naam : null });
    })();
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/eigenaar', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const b = await body<{ gebruiker_id: unknown }>(c);
    const doel = typeof b.gebruiker_id === 'number' ? gebruiker(ctx.db, b.gebruiker_id) : null;
    if (!doel || doel.archived_at || !isBeheerder(doel)) fout(400, 'Kies een actieve beheerder.');
    if (doel.id === d.eigenaar_id) return c.json({ dossier: d });
    ctx.db.prepare('UPDATE dossiers SET eigenaar_id = ? WHERE id = ?').run(doel.id, d.id);
    audit(ctx, actorVan(c), d.id, 'eigenaar_gewijzigd', { van: gebruiker(ctx.db, d.eigenaar_id)!.naam, naar: doel.naam });
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/sluiten', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const b = await body<Record<string, unknown>>(c);
    const reden = b.reden as SluitReden;
    if (!SLUIT_REDENEN.includes(reden)) fout(400, 'Kies een reden.');
    const toelichting = tekstVeld(b, 'toelichting');
    if (reden === 'Uitgevoerd' && !d.werk_opgeleverd_at && !toelichting) fout(400, 'Licht toe wat er is gebeurd.');
    ctx.db.transaction(() => {
      ctx.db
        .prepare('UPDATE dossiers SET gesloten_at = ?, gesloten_by = ?, gesloten_reden = ?, gesloten_toelichting = ? WHERE id = ?')
        .run(ctx.klok.iso(), c.get('ik').id, reden, toelichting || null, d.id);
      // Closing ends the ijskast, so nobody is mailed about a closed dossier.
      ctx.db.prepare('UPDATE ijskast SET eind_at = ? WHERE dossier_id = ? AND eind_at IS NULL').run(ctx.klok.iso(), d.id);
      audit(ctx, actorVan(c), d.id, 'gesloten', { reden, toelichting: toelichting || null });
    })();
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/heropenen', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    if (!d.gesloten_at) return c.json({ dossier: d });
    ctx.db.prepare('UPDATE dossiers SET gesloten_at = NULL, gesloten_by = NULL, gesloten_reden = NULL, gesloten_toelichting = NULL WHERE id = ?').run(d.id);
    audit(ctx, actorVan(c), d.id, 'heropend', { reden: d.gesloten_reden });
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.delete('/api/dossiers/:id', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const bestanden = ctx.db.prepare('SELECT id FROM fotos WHERE dossier_id = ?').all(d.id) as { id: string }[];
    ctx.db.transaction(() => {
      ctx.db.prepare('DELETE FROM audit WHERE dossier_id = ?').run(d.id);
      ctx.db.prepare('DELETE FROM dossiers WHERE id = ?').run(d.id);
      audit(ctx, actorVan(c), null, 'dossier_verwijderd', { dossier_id: d.id, adres: adresRegel(d) });
    })();
    for (const f of bestanden) fs.rmSync(fotoPad(ctx.config, f.id), { force: true });
    return c.json({ ok: true });
  });

  app.post('/api/dossiers/:id/ijskast', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    if (inIjskast(d, ctx.klok.nu())) fout(409, 'Dit dossier staat al in de ijskast.');
    const b = await body<Record<string, unknown>>(c);
    const tot = tekstVeld(b, 'tot');
    const reden = tekstVeld(b, 'reden');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tot) || tot <= isoDatum(ctx.klok.nu())) fout(400, 'Kies een datum in de toekomst.');
    if (!reden) fout(400, 'Schrijf de reden op.');
    ctx.db.transaction(() => {
      // One whose day came before the eigenaar was mailed: putting the dossier back in answers that mail.
      ctx.db.prepare('UPDATE ijskast SET eind_at = ? WHERE dossier_id = ? AND eind_at IS NULL').run(ctx.klok.iso(), d.id);
      ctx.db.prepare('INSERT INTO ijskast (dossier_id, tot, reden, created_at, created_by) VALUES (?, ?, ?, ?, ?)').run(d.id, tot, reden, ctx.klok.iso(), c.get('ik').id);
      audit(ctx, actorVan(c), d.id, 'ijskast_in', { tot, reden });
    })();
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.post('/api/dossiers/:id/ijskast-uit', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const k = inIjskast(d, ctx.klok.nu());
    if (!k) return c.json({ dossier: d });
    ctx.db.prepare('UPDATE ijskast SET eind_at = ? WHERE id = ?').run(ctx.klok.iso(), k.id);
    audit(ctx, actorVan(c), d.id, 'ijskast_uit', { tot: k.tot });
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  // "Opnieuw versturen niet nodig": accepts the plan changes since the last send to this recipient.
  app.post('/api/dossiers/:id/ack', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    nietGesloten(d);
    const b = await body<Record<string, unknown>>(c);
    const ontvanger = b.ontvanger as Ontvanger;
    if (!['bewoner', 'corporatie', 'uitvoerder'].includes(ontvanger)) fout(400, 'Ongeldige ontvanger');
    const notitie = tekstVeld(b, 'notitie');
    if (!notitie) fout(400, 'Schrijf een notitie.');
    ctx.db.prepare('INSERT INTO plan_acks (dossier_id, ontvanger, notitie, created_at, created_by) VALUES (?, ?, ?, ?, ?)').run(d.id, ontvanger, notitie, ctx.klok.iso(), c.get('ik').id);
    audit(ctx, actorVan(c), d.id, 'opnieuw_versturen_niet_nodig', { ontvanger, notitie });
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  // The red X: hides meldingen on this dossier for good, also on a closed one. A Plan gewijzigd finding is accepted
  // as "Opnieuw versturen niet nodig" instead, so the next plan change warns again.
  app.post('/api/dossiers/:id/verbergen', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const { sleutels } = await body<{ sleutels: unknown }>(c);
    if (!Array.isArray(sleutels) || sleutels.length === 0 || !sleutels.every((x) => typeof x === 'string')) fout(400, 'Ongeldige meldingen');
    const zichtbaar = new Map(aandacht(d, gebruikersMap(ctx.db), ctx.klok.nu()).bevindingen.map((b) => [b.sleutel, { tekst: b.tekst, ontvanger: b.ontvanger }]));
    const items = kaartItems(d);
    if (!items.daken.length) zichtbaar.set('geen_dak', { tekst: KAART_MELDINGEN.geen_dak, ontvanger: undefined });
    if (!items.tuinen.length) zichtbaar.set('geen_tuin', { tekst: KAART_MELDINGEN.geen_tuin, ontvanger: undefined });
    const nieuw = [...new Set(sleutels as string[])].filter((s) => !d.verborgen.includes(s));
    if (nieuw.some((s) => !zichtbaar.has(s))) fout(409, 'Deze melding staat er niet meer. Herlaad de pagina.');
    if (nieuw.length) {
      const nu = ctx.klok.iso();
      const ik = c.get('ik').id;
      ctx.db.transaction(() => {
        for (const s of nieuw) {
          const { ontvanger } = zichtbaar.get(s)!;
          if (ontvanger) ctx.db.prepare("INSERT INTO plan_acks (dossier_id, ontvanger, notitie, created_at, created_by) VALUES (?, ?, '', ?, ?)").run(d.id, ontvanger, nu, ik);
          else ctx.db.prepare('INSERT INTO verborgen_meldingen (dossier_id, sleutel, created_at, created_by) VALUES (?, ?, ?, ?)').run(d.id, s, nu, ik);
        }
        audit(ctx, actorVan(c), d.id, 'meldingen_verborgen', { meldingen: nieuw.map((s) => zichtbaar.get(s)!.tekst) });
      })();
    }
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  app.get('/api/dossiers/:id/activiteit', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const rijen = ctx.db.prepare('SELECT * FROM audit WHERE dossier_id = ? ORDER BY id DESC').all(d.id) as AuditRij[];
    return c.json({ adres: adresRegel(d), items: rijen.map(auditItem), gebruikers: gebruikersVoor(c.get('ik'), gebruikersMap(ctx.db)) });
  });
}

export function auditItem(r: AuditRij): Omit<AuditRij, 'payload'> & { payload: Record<string, Json> } {
  return { ...r, payload: JSON.parse(r.payload) as Record<string, Json> };
}
