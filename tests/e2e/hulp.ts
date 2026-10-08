// Shared steps for the E2E scenarios: test-only server routes for setup and inspection, and the UI moves every scenario repeats.
import { type APIRequestContext, type Locator, type Page, expect } from '@playwright/test';

export const ADRES = 'Walstraat 74, Deventer';
export const BEHEERDER = { naam: 'Anna Beheer', email: 'anna@ulebelt.test' };
export const KLUSSER = { naam: 'Kees Klusser', email: 'kees@ulebelt.test' };
// Monday 2 March 2026, 10:00 in Amsterdam. The test clock keeps running from here, so later actions get later timestamps.
export const BEGIN = new Date('2026-03-02T09:00:00.000Z');

async function ok<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()}: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function post<T = Record<string, unknown>>(r: APIRequestContext, pad: string, data: unknown = {}): Promise<T> {
  return ok<T>(await r.post(pad, { data }));
}

// Empties the database (which reseeds the standard materials), mailbox and recorded documents, sets the clock to BEGIN and logs in a fresh admin.
export async function start(page: Page): Promise<{ beheerderId: number; klusserId: number }> {
  const r = page.request;
  await post(r, '/api/test/reset');
  const { nu } = await post<{ nu: string }>(r, '/api/test/klok');
  await post(r, '/api/test/klok', { verschuifDagen: (BEGIN.getTime() - new Date(nu).getTime()) / 864e5 });
  const { id: beheerderId } = await post<{ id: number }>(r, '/api/test/gebruiker', { ...BEHEERDER, rol: 'beheerder' });
  const { id: klusserId } = await post<{ id: number }>(r, '/api/test/gebruiker', { ...KLUSSER, rol: 'klusser', telefoon: '0612345678' });
  await login(page, BEHEERDER.email);
  return { beheerderId, klusserId };
}

export async function login(page: Page, email: string): Promise<void> {
  await post(page.request, '/api/test/login', { email });
}

// Moves the server clock and reloads, since the page computes aandacht from the server time it got on load.
export async function verschuifDagen(page: Page, dagen: number): Promise<void> {
  await post(page.request, '/api/test/klok', { verschuifDagen: dagen });
  await page.reload();
}

export interface Email {
  aan: string;
  onderwerp: string;
  tekst: string;
  bijlagen: string[];
}

export async function emails(page: Page): Promise<Email[]> {
  return (await ok<{ emails: Email[] }>(await page.request.get('/api/test/emails'))).emails;
}

// Plain text of the most recently printed document (a PDF attachment or a fetched plan.pdf).
export async function laatsteDocument(page: Page): Promise<string> {
  const { html } = await ok<{ html: string[] }>(await page.request.get('/api/test/documenten'));
  if (!html.length) throw new Error('Nog geen document geprint');
  return tekst(html[html.length - 1]);
}

export function tekst(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/ ([:.,])/g, '$1')
    .trim();
}

// Prints the Plan van Aanpak as the details page link does, and returns its text.
export async function planTekst(page: Page, id: number): Promise<string> {
  const res = await page.request.get(`/docs/dossiers/${id}/plan.pdf`);
  expect(res.status()).toBe(200);
  return laatsteDocument(page);
}

export async function opslagKlaar(page: Page): Promise<void> {
  await expect(page.locator('.qa-opslag-bezig')).toHaveCount(0);
  await expect(page.locator('.qa-opslag-klaar')).toBeVisible();
}

export async function ja(page: Page): Promise<void> {
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
}

export function veld(page: Page, naam: string): Locator {
  return page.locator(`.qa-veld-${naam}`);
}

export async function vul(page: Page, naam: string, waarde: string): Promise<void> {
  await veld(page, naam).locator('.qa-invoer').fill(waarde);
}

export async function kies(page: Page, naam: string, optie: string): Promise<void> {
  await veld(page, naam).locator(`.qa-optie-${optie}`).check();
}

// Sends the open mail pop-up as it is, or marks it as sent by hand; waits until it closes.
export async function verstuurMail(page: Page, handmatig = false): Promise<void> {
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();
  await modal.locator(handmatig ? '.qa-mail-handmatig' : '.qa-mail-versturen').click();
  await expect(modal).toHaveCount(0);
}

export async function mail(page: Page, sjabloon: string, handmatig = false): Promise<void> {
  await page.locator(`.qa-mail-${sjabloon}`).click();
  await verstuurMail(page, handmatig);
}

export async function annuleerMail(page: Page): Promise<void> {
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();
  await modal.locator('.btn-close').click();
  await expect(modal).toHaveCount(0);
}

export async function naarDossier(page: Page, id: number): Promise<void> {
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-status')).toBeVisible();
}

export async function status(page: Page, label: string): Promise<void> {
  await expect(page.locator('.qa-sectie-status .qa-status')).toHaveText(label);
}

export async function geenAandacht(page: Page): Promise<void> {
  await expect(page.locator('.qa-aandacht')).toHaveCount(0);
}

// Creates a dossier from the list and fills in the intake up to (not including) the subsidie mail.
export async function nieuwDossier(page: Page, opts: { huurKoop: 'huur' | 'koop'; riool?: 'gemengd' | 'gescheiden'; corporatie?: string }): Promise<number> {
  await page.goto('/dossiers');
  await page.locator('.qa-nieuw-dossier').click();
  await expect(page).toHaveURL(/\/dossiers\/\d+\/intake$/);
  const id = Number(/\/dossiers\/(\d+)\//.exec(page.url())![1]);

  await page.locator('.qa-adres-zoek').fill('Walstraat 74');
  await page.locator('.qa-adres-suggestie').first().click();
  await expect(page.locator('.qa-adres-gekozen')).toContainText(ADRES);
  await vul(page, 'bewoner_naam', 'Bea Bewoner');
  await vul(page, 'bewoner_email', 'bea@example.org');
  await kies(page, 'huur_koop', opts.huurKoop);
  if (opts.huurKoop === 'huur') await veld(page, 'woningeigenaar').locator(`.qa-optie-${opts.corporatie ?? 'Ieder1'}`).check();
  await kies(page, 'woningtype', 'tussenwoning');
  await kies(page, 'rioolstelsel', opts.riool ?? 'gemengd');
  await opslagKlaar(page);
  return id;
}

// The rest of the intake: the subsidie mail, after which the intake is complete.
export async function subsidieMail(page: Page, huurKoop: 'huur' | 'koop'): Promise<void> {
  await mail(page, `subsidie_${huurKoop}`);
  await expect(page.locator('.qa-subsidiemail .qa-subsidie-verstuurd')).toBeVisible();
  await expect(page.locator('.qa-intake-compleet')).toBeVisible();
}

// Picks a user in the bezoeker/uitvoerder dropdown (whose search field gets the focus on opening); the mail pop-up that follows is sent or cancelled.
export async function wijsToe(page: Page, rol: 'bezoeker' | 'uitvoerder', id: number, mailen: boolean): Promise<void> {
  const blok = page.locator(`.qa-toewijzen-${rol}`);
  await blok.locator('.qa-toewijzen-knop').click();
  await expect(blok.locator('.qa-toewijzen-zoek')).toBeFocused();
  await blok.locator(`.qa-kandidaat-${id}`).click();
  if (mailen) await verstuurMail(page);
  else await annuleerMail(page);
}

// An afspraak as the details page takes it: a local date plus a time.
export async function afspraak(page: Page, dag: string, tijd = '10:00'): Promise<void> {
  const v = veld(page, 'afspraak');
  await v.locator('.qa-datum').fill(dag);
  await v.locator('.qa-tijd').fill(tijd);
  await opslagKlaar(page);
}

// Fills a few Bezoek answers and taps "Bezoek afronden", confirming the warning about what's still missing.
export async function bezoek(page: Page, id: number, wensen = 'Regenton bij de achtergevel.'): Promise<void> {
  await page.goto(`/dossiers/${id}/bezoek`);
  await vul(page, 'wensen', wensen);
  await vul(page, 'verhard', '40');
  await opslagKlaar(page);
  await page.locator('.qa-bezoek-afronden').click();
  await ja(page);
  await expect(page.locator('.qa-mijlpaal-bezoek_afgerond')).toBeVisible();
}

// A minimal Plan van Aanpak: beoordeling, one voorstel, an Aantal for the first material; then "Klaar voor controle", confirming if asked (a klusser always is, an admin only when something is missing).
export async function plan(page: Page, id: number, opts: { voorstel?: string; aantal?: string } = {}): Promise<void> {
  await page.goto(`/dossiers/${id}/plan`);
  await kies(page, 'beoordeling', 'uitvoerbaar');
  await page.locator('.qa-voorstel-toevoegen').click();
  await page.locator('.qa-voorstel-rij input').last().fill(opts.voorstel ?? 'Regenton plaatsen bij pijp A');
  await page.locator('.qa-materialen-materialen .qa-materiaal-rij').first().locator('.qa-materiaal-aantal').fill(opts.aantal ?? '2');
  await opslagKlaar(page);
  await page.locator('.qa-klaar-voor-controle').click();
  const mijlpaal = page.locator('.qa-mijlpaal-klaar_voor_controle');
  await expect(page.locator('.qa-bevestig').or(mijlpaal)).toBeVisible();
  if (await page.locator('.qa-bevestig').isVisible()) await ja(page);
  await expect(mijlpaal).toBeVisible();
}

// The uitvoerder's page: what was done, then "Werk opgeleverd".
export async function uitvoering(page: Page, id: number, uitgevoerd = 'Regenton geplaatst en pijp afgekoppeld.'): Promise<void> {
  await page.goto(`/dossiers/${id}/uitvoering`);
  await expect(page.locator('.qa-materialen-gebruikt .qa-materiaal-rij')).toHaveCount(1);
  await vul(page, 'uitgevoerd', uitgevoerd);
  await opslagKlaar(page);
  await page.locator('.qa-werk-opgeleverd').click();
  await ja(page);
  await expect(page.locator('.qa-mijlpaal-werk_opgeleverd')).toBeVisible();
}

// Closes via the header menu with a reden and optional toelichting.
export async function sluit(page: Page, reden: string, toelichting = ''): Promise<void> {
  await page.locator('.qa-dossier-menu').click();
  await page.locator('.qa-menu-sluiten').click();
  await sluitModal(page, reden, toelichting);
}

export async function sluitModal(page: Page, reden: string | null, toelichting = ''): Promise<void> {
  const modal = page.locator('.qa-sluit-modal');
  if (reden) await modal.locator(`.qa-reden-${reden}`).check();
  if (toelichting) await modal.locator('.qa-sluit-toelichting').fill(toelichting);
  await modal.locator('.qa-actie-ok').click();
  await expect(modal).toHaveCount(0);
}
