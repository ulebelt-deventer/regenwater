import type { Hono } from 'hono';
import { SUBSIDIE_INFO_URL } from '../../shared/constants.ts';
import { adresRegel, corporatieEmail, corporatieNaam, str } from '../../shared/status.ts';
import { SJABLONEN, type SjabloonDef, ontbrekendeWaarden, vulIn } from '../../shared/sjablonen.ts';
import type { Dossier, Gebruiker } from '../../shared/types.ts';
import { audit } from '../audit.ts';
import { alleenBeheerder } from '../auth.ts';
import { type C, type Ctx, type Env, actorVan, body, fout } from '../context.ts';
import { bijlageNaam, bijlagePdf } from '../documenten/index.tsx';
import { log } from '../log.ts';
import { EMAIL_RE, tekstNaarHtml } from '../mail.ts';
import { dossierLink, dossierMelding } from '../meldingen.ts';
import { gebruiker, laadDossier } from '../repo.ts';
import { haalDossier } from './dossiers.ts';

export function sjabloonTekst(ctx: Ctx, key: string): { onderwerp: string; tekst: string } {
  const r = ctx.db.prepare('SELECT onderwerp, tekst FROM sjablonen WHERE key = ?').get(key) as { onderwerp: string; tekst: string } | undefined;
  if (!r) throw new Error(`Sjabloon ${key} ontbreekt in de database`);
  return r;
}

// A provider's error can be a whole HTML page; the full text stays in verzendingen.mislukt_reden.
const FOUTMELDING_MAX = 300;

function foutmelding(mislukt: string): string {
  const kort = mislukt.replace(/\s+/g, ' ').trim();
  return kort.length > FOUTMELDING_MAX ? `${kort.slice(0, FOUTMELDING_MAX)}…` : kort;
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
    const waarden = tagWaarden(ctx, d, c.get('actor'));
    return c.json({
      sjabloon: { key: def.key, naam: def.naam, ontvanger: def.ontvanger, tags: def.tags, verplicht: def.verplicht },
      aan: standaardAan(ctx, d, def),
      cc: c.get('actor').email,
      onderwerp: vulIn(t.onderwerp, waarden),
      tekst: vulIn(t.tekst, waarden),
      waarden: Object.fromEntries(def.tags.map((k) => [k, waarden[k]])),
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
    // An extra CC beside the sender's own copy, for the woningcorporatie mails only.
    const extraCc = typeof b.cc === 'string' ? b.cc.trim() : '';
    const onderwerp = typeof b.onderwerp === 'string' ? b.onderwerp.trim() : '';
    const tekst = typeof b.tekst === 'string' ? b.tekst : '';
    const handmatig = b.handmatig === true;
    if (!EMAIL_RE.test(aan)) fout(400, 'Vul een geldig e-mailadres in bij Aan.');
    if (extraCc && def.ontvanger !== 'corporatie') fout(400, 'Deze e-mail heeft geen CC.');
    if (extraCc && !EMAIL_RE.test(extraCc)) fout(400, 'Vul een geldig e-mailadres in bij CC.');
    if (!onderwerp || !tekst.trim()) fout(400, 'Onderwerp en tekst mogen niet leeg zijn.');
    const afzender = c.get('actor');
    const waarden = tagWaarden(ctx, d, afzender);
    // A klusser's dossier link carries their address in the href only, so a logged-out tap prefills the login form.
    const html = def.ontvanger === 'bezoeker' || def.ontvanger === 'uitvoerder' ? tekstNaarHtml(tekst, { [waarden.link]: `${waarden.link}?email=${encodeURIComponent(aan)}` }) : undefined;
    const bericht = { aan, cc: extraCc ? `${afzender.email}, ${extraCc}` : afzender.email, replyTo: gebruiker(ctx.db, d.eigenaar_id)!.email, onderwerp, tekst, html };
    const ontbrekend = ontbrekendeWaarden(def, waarden, onderwerp, tekst);
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
    opslaan.run(d.id, def.key, def.ontvanger, aan, handmatig ? null : bericht.cc, bericht.onderwerp, bericht.tekst, handmatig ? 1 : 0, mislukt ? nu : null, mislukt, nu, afzender.id);
    audit(ctx, actorVan(c), d.id, handmatig ? 'handmatig_verstuurd' : mislukt ? 'email_mislukt' : 'email_verstuurd', {
      sjabloon: def.key, aan, ...(extraCc && !handmatig ? { cc: extraCc } : {}), onderwerp: bericht.onderwerp, tekst: bericht.tekst, tag_problemen: ontbrekend.length > 0,
    });
    if (mislukt) {
      dossierMelding(ctx, d, 'mail_mislukt', `E-mail niet afgeleverd aan ${aan}. Foutmelding: ${foutmelding(mislukt)}`);
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
