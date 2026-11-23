import type { Hono } from 'hono';
import type { JSX } from 'solid-js';
import { renderToString } from 'solid-js/web';
import { isBeheerder } from '../../shared/rechten.ts';
import { geenSpecificatie } from '../../shared/specificatie.ts';
import type { Dossier } from '../../shared/types.ts';
import { alleenBeheerder } from '../auth.ts';
import { type C, type Ctx, type Env, fout } from '../context.ts';
import { fotoDataUrl } from '../fotos.ts';
import { gebruikersMap, subsidiepagina } from '../repo.ts';
import { haalDossier } from '../routes/dossiers.ts';
import { adresRegel } from '../../shared/status.ts';
import { Bezoekformulier } from './formulier.tsx';
import { type Doc, Pagina } from './onderdelen.tsx';
import { Opleverrapport, Plan } from './plan.tsx';
import { Uitvoeringsspecificatie } from './specificatie.tsx';
import { documentStijl } from './stijl.ts';

export const BIJLAGE_NAAM = { plan: 'Plan van Aanpak', opleverrapport: 'Opleverrapport' } as const;

const bestandAdres = (d: Dossier) => adresRegel(d).replace(/[^\p{L}\p{N} -]/gu, '');

export function bijlageNaam(d: Dossier, soort: keyof typeof BIJLAGE_NAAM): string {
  return `${BIJLAGE_NAAM[soort]} ${bestandAdres(d)}.pdf`;
}

function doc(ctx: Ctx, d: Dossier, concept = false): Doc {
  return { d, gm: gebruikersMap(ctx.db), concept, foto: (id) => fotoDataUrl(ctx.config, id), subsidiepagina: subsidiepagina(ctx.db, d) };
}

function html(titel: string, inhoud: () => JSX.Element, scherm = false): string {
  return `<!doctype html>${renderToString(() => (
    <Pagina titel={titel} stijl={documentStijl()} scherm={scherm}>
      {inhoud()}
    </Pagina>
  ))}`;
}

const standaardMaterialen = (ctx: Ctx) => (ctx.db.prepare('SELECT naam FROM materialen ORDER BY volgorde, id').all() as { naam: string }[]).map((r) => r.naam);

export function bijlagePdf(ctx: Ctx, d: Dossier, soort: keyof typeof BIJLAGE_NAAM): Promise<Buffer> {
  const x = doc(ctx, d);
  const Inhoud = soort === 'plan' ? Plan : Opleverrapport;
  return ctx.pdf.print(html(BIJLAGE_NAAM[soort], () => <Inhoud doc={x} />));
}

function pdf(c: C, inhoud: Buffer, naam: string): Response {
  return c.body(new Uint8Array(inhoud), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${naam}"`,
    'Cache-Control': 'private, no-store',
  });
}

function opgeleverd(d: Dossier): void {
  if (!d.werk_opgeleverd_at) fout(409, 'Het werk is nog niet opgeleverd.');
}

export function documentRoutes(app: Hono<Env>, ctx: Ctx): void {
  app.get('/docs/dossiers/:id/plan.pdf', async (c) => {
    const d = haalDossier(ctx, c);
    return pdf(c, await bijlagePdf(ctx, d, 'plan'), bijlageNaam(d, 'plan'));
  });

  app.get('/docs/dossiers/:id/concept-plan', (c) => {
    const d = haalDossier(ctx, c);
    const x = doc(ctx, d, true);
    return c.html(html('Concept Plan van Aanpak', () => <Plan doc={x} />, true));
  });

  app.get('/docs/dossiers/:id/opleverrapport.pdf', async (c) => {
    const d = haalDossier(ctx, c);
    if (!isBeheerder(c.get('ik')) && c.get('ik').id !== d.uitvoerder_id) fout(403, 'Alleen voor beheerders en de uitvoerder');
    opgeleverd(d);
    return pdf(c, await bijlagePdf(ctx, d, 'opleverrapport'), bijlageNaam(d, 'opleverrapport'));
  });

  app.get('/docs/dossiers/:id/bezoekformulier.pdf', async (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const x = doc(ctx, d);
    const inhoud = await ctx.pdf.print(html('Bezoekformulier', () => <Bezoekformulier doc={x} standaardMaterialen={[]} />));
    return pdf(c, inhoud, `Bezoekformulier ${bestandAdres(d)}.pdf`);
  });

  app.get('/docs/bezoekformulier-leeg.pdf', async (c) => {
    alleenBeheerder(c);
    const namen = standaardMaterialen(ctx);
    const inhoud = await ctx.pdf.print(html('Leeg bezoekformulier', () => <Bezoekformulier doc={null} standaardMaterialen={namen} />));
    return pdf(c, inhoud, 'Leeg bezoekformulier.pdf');
  });

  app.get('/docs/dossiers/:id/uitvoeringsspecificatie', (c) => {
    alleenBeheerder(c);
    const d = haalDossier(ctx, c);
    const reden = geenSpecificatie(d);
    if (reden) fout(409, reden);
    const x = doc(ctx, d);
    return c.html(html(`Uitvoeringsspecificatie ${bestandAdres(d)}`, () => <Uitvoeringsspecificatie doc={x} />, true));
  });
}
