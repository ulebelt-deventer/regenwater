import type { Hono } from 'hono';
import { SUBSIDIE_INFO_URL } from '../../shared/constants.ts';
import { adresRegel, corporatieEmail, corporatieNaam, str } from '../../shared/status.ts';
import { SJABLONEN, type SjabloonDef, controleerTags, vulIn } from '../../shared/sjablonen.ts';
import type { Dossier, Gebruiker } from '../../shared/types.ts';
import { audit } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type C, type Ctx, type Env, actorVan, body, fout } from '../context.ts';
import { bijlageNaam, bijlagePdf } from '../documenten/index.tsx';
import { log } from '../log.ts';
import { dossierLink, melding } from '../meldingen.ts';
import { laadDossier } from '../repo.ts';
import { haalDossier } from './dossiers.ts';
import { EMAIL_RE } from './gebruikers.ts';

export function sjabloonTekst(ctx: Ctx, key: string): { onderwerp: string; tekst: string } {
  const r = ctx.db.prepare('SELECT onderwerp, tekst FROM sjablonen WHERE key = ?').get(key) as { onderwerp: string; tekst: string } | undefined;
  if (!r) throw new Error(`Sjabloon ${key} ontbreekt in de database`);
  return r;
}

const naamVan = (ctx: Ctx, id: number | null) =>
  id === null ? '' : (ctx.db.prepare('SELECT naam FROM gebruikers WHERE id = ?').get(id) as { naam: string }).naam;

// What each {tag} becomes for this dossier, sent by `afzender`.
export function tagWaarden(ctx: Ctx, d: Dossier, afzender: Gebruiker): Record<string, string> {
  return {
    bewoner: str(d, 'bewoner_naam') ?? '',
    adres: adresRegel(d),
    corporatie: corporatieNaam(d) ?? '',
    bezoeker: naamVan(ctx, d.bezoeker_id),
    uitvoerder: naamVan(ctx, d.uitvoerder_id),
    afzender: afzender.naam,
    link: dossierLink(ctx, d.id),
    straat: d.adres ? d.adres.straat : '',
    plaats: d.adres ? d.adres.plaats : '',
    subsidie_info: SUBSIDIE_INFO_URL,
  };
}

function standaardAan(ctx: Ctx, d: Dossier, def: SjabloonDef): string {
  switch (def.ontvanger) {
    case 'bewoner':
      return str(d, 'bewoner_email') ?? '';
    case 'corporatie':
      return corporatieEmail(d);
    case 'bezoeker':
    case 'uitvoerder': {
      const id = d[`${def.ontvanger}_id`];
      return id === null ? '' : (ctx.db.prepare('SELECT email FROM gebruikers WHERE id = ?').get(id) as { email: string }).email;
    }
    default:
      throw new Error(`Sjabloon ${def.key} heeft geen ontvanger`);
  }
}

function mailDef(c: C): SjabloonDef {
  const def = SJABLONEN.find((s) => s.key === c.req.param('sjabloon'));
  if (!def || def.ontvanger === null) fout(404, 'Onbekend sjabloon');
  return def;
}

export function mailRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/api/dossiers/:id/mail/:sjabloon', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const def = mailDef(c);
    const t = sjabloonTekst(ctx, def.key);
    return c.json({
      sjabloon: { key: def.key, naam: def.naam, ontvanger: def.ontvanger, tags: def.tags, verplicht: def.verplicht },
      aan: standaardAan(ctx, d, def),
      cc: c.get('actor').email,
      onderwerp: t.onderwerp,
      tekst: t.tekst,
      waarden: Object.fromEntries(def.tags.map((k) => [k, tagWaarden(ctx, d, c.get('actor'))[k]])),
      bijlage: def.bijlage ? bijlageNaam(d, def.bijlage) : null,
      eerder: d.verzendingen.filter((v) => v.sjabloon === def.key),
    });
  });

  app.post('/api/dossiers/:id/mail/:sjabloon', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const def = mailDef(c);
    if (d.gesloten_at && !def.key.startsWith('oplever_')) fout(409, 'Dit dossier is gesloten. Heropen het om deze e-mail te versturen.');
    if (def.bijlage === 'opleverrapport' && !d.werk_opgeleverd_at) fout(409, 'Het werk is nog niet opgeleverd.');
    const b = await body<Record<string, unknown>>(c);
    const aan = typeof b.aan === 'string' ? b.aan.trim() : '';
    const onderwerp = typeof b.onderwerp === 'string' ? b.onderwerp.trim() : '';
    const tekst = typeof b.tekst === 'string' ? b.tekst : '';
    const handmatig = b.handmatig === true;
    if (!EMAIL_RE.test(aan)) fout(400, 'Vul een geldig e-mailadres in bij Aan.');
    if (!onderwerp || !tekst.trim()) fout(400, 'Onderwerp en tekst mogen niet leeg zijn.');
    const afzender = c.get('actor');
    const waarden = tagWaarden(ctx, d, afzender);
    const bericht = { aan, cc: afzender.email, replyTo: afzender.email, onderwerp: vulIn(onderwerp, waarden), tekst: vulIn(tekst, waarden) };
    const problemen = controleerTags(def, onderwerp, tekst);
    const nu = ctx.klok.iso();
    const opslaan = ctx.db.prepare(
      'INSERT INTO verzendingen (dossier_id, sjabloon, ontvanger, aan, cc, onderwerp, tekst, handmatig, mislukt_at, mislukt_reden, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    let mislukt: string | null = null;
    if (!handmatig) {
      const bijlagen = def.bijlage ? [{ naam: bijlageNaam(d, def.bijlage), inhoud: await bijlagePdf(ctx, d, def.bijlage) }] : [];
      try {
        await ctx.mailer.verstuur({ ...bericht, bijlagen });
      } catch (e) {
        mislukt = e instanceof Error ? e.message : String(e);
        log.warn(`e-mail niet afgeleverd: ${bericht.onderwerp} aan ${aan}: ${mislukt}`);
      }
    }
    opslaan.run(d.id, def.key, def.ontvanger, aan, handmatig ? null : afzender.email, bericht.onderwerp, bericht.tekst, handmatig ? 1 : 0, mislukt ? nu : null, mislukt, nu, afzender.id);
    audit(ctx, actorVan(c), d.id, handmatig ? 'handmatig_verstuurd' : mislukt ? 'email_mislukt' : 'email_verstuurd', {
      sjabloon: def.key, aan, onderwerp: bericht.onderwerp, tekst: bericht.tekst, tag_problemen: problemen.onbekend.length + problemen.ontbrekend.length > 0,
    });
    if (mislukt) {
      await melding(ctx, `E-mail niet afgeleverd: ${bericht.onderwerp} aan ${aan}`, `De e-mail "${bericht.onderwerp}" aan ${aan} is niet afgeleverd.\n\nFoutmelding: ${mislukt}\n\n${dossierLink(ctx, d.id)}`, d.id);
      fout(502, `De e-mail aan ${aan} kon niet worden verstuurd. Controleer het adres en probeer het opnieuw.`);
    }
    return c.json({ dossier: laadDossier(ctx.db, d.id)! });
  });

  // The Signal oproep text, filled in, for the clipboard.
  app.get('/api/dossiers/:id/oproep', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    return c.json({ tekst: vulIn(sjabloonTekst(ctx, 'oproep_signal').tekst, tagWaarden(ctx, d, c.get('actor'))) });
  });
}
