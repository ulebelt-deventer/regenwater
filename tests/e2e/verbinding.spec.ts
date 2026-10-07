// Autosave over a bad connection in a real browser: offline edits, reloads, photo uploads, leaving the page and an expired session. The queue's timing rules are in src/client/opslag.test.ts.
import { type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { BEHEERDER, login, nieuwDossier, opslagKlaar, start, veld, vul } from './hulp.ts';

const PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#88d356' } }).png().toBuffer();

async function serverData(page: Page, id: number): Promise<Record<string, unknown>> {
  const res = await page.request.get(`/api/dossiers/${id}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data;
}

async function bezoekPagina(page: Page): Promise<number> {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  return id;
}

test('zonder verbinding blijft een wijziging bewaard en gaat hij mee zodra de verbinding terug is', async ({ page, context }) => {
  const id = await bezoekPagina(page);
  await context.setOffline(true);
  await vul(page, 'wensen', 'Twee regentonnen');
  await expect(page.locator('.qa-opslag-mislukt')).toBeVisible();
  await expect(page.locator('.qa-melding-danger')).toContainText('Opslaan mislukt: er is geen verbinding met de server.');
  await vul(page, 'hoosbuien', 'Plas bij de schuur');
  await context.setOffline(false);
  await opslagKlaar(page);
  expect(await serverData(page, id)).toMatchObject({ wensen: 'Twee regentonnen', hoosbuien: 'Plas bij de schuur' });
});

test('een wijziging zonder verbinding overleeft het herladen van de pagina', async ({ page }) => {
  const id = await bezoekPagina(page);
  // Saves fail as on a dropped connection while the page itself still loads.
  await page.route(`**/api/dossiers/${id}`, (r) => (r.request().method() === 'PATCH' ? r.abort('internetdisconnected') : r.fallback()));
  await vul(page, 'wensen', 'Tegels eruit');
  await expect(page.locator('.qa-opslag-mislukt')).toBeVisible();
  await page.reload();
  await expect(veld(page, 'wensen').locator('.qa-invoer')).toHaveValue('Tegels eruit');
  await expect(page.locator('.qa-opslag-klaar')).toHaveCount(0);
  expect((await serverData(page, id)).wensen).toBeUndefined();

  await page.unroute(`**/api/dossiers/${id}`);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await opslagKlaar(page);
  expect((await serverData(page, id)).wensen).toBe('Tegels eruit');
});

test('een foto zonder verbinding wacht zichtbaar en wordt na herstel alsnog geüpload', async ({ page, context }) => {
  const id = await bezoekPagina(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await context.setOffline(true);
  await slot.locator('.qa-foto-invoer').setInputFiles({ name: 'tuin.png', mimeType: 'image/png', buffer: PNG });
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(1);
  await expect(page.locator('.qa-opslag-bezig')).toBeVisible();
  await context.setOffline(false);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(0);
  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  expect(((await res.json()) as { dossier: { fotos: { slot: string }[] } }).dossier.fotos.map((f) => f.slot)).toEqual(['tuinsituatie']);
});

test('een foto die wacht op verbinding overleeft het herladen van de pagina', async ({ page }) => {
  const id = await bezoekPagina(page);
  await page.route(`**/api/dossiers/${id}/fotos/**`, (r) => r.abort('internetdisconnected'));
  const slot = page.locator('.qa-fotoslot-hoosbuien');
  await slot.locator('.qa-foto-invoer').setInputFiles({ name: 'plas.png', mimeType: 'image/png', buffer: PNG });
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(1);
  await page.reload();
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(1);
  await page.unroute(`**/api/dossiers/${id}/fotos/**`);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(0);
});

test('weggaan terwijl er nog iets niet is opgeslagen vraagt om bevestiging', async ({ page, context }) => {
  await bezoekPagina(page);
  await context.setOffline(true);
  await vul(page, 'wensen', 'Nog niet verstuurd');
  await expect(page.locator('.qa-opslag-mislukt')).toBeVisible();
  const dialoog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const d = await dialoog;
  expect(d.type()).toBe('beforeunload');
  await d.dismiss();
});

test('weggaan als alles is opgeslagen vraagt niets', async ({ page }) => {
  await bezoekPagina(page);
  await vul(page, 'wensen', 'Opgeslagen');
  await opslagKlaar(page);
  let gevraagd = false;
  page.on('dialog', (d) => {
    gevraagd = true;
    void d.dismiss();
  });
  await page.goto('/dossiers');
  await expect(page.locator('.qa-dossiers')).toBeVisible();
  expect(gevraagd).toBe(false);
});

test('bij een verlopen sessie blijven de wijzigingen bewaard en gaan ze mee na opnieuw inloggen', async ({ page, context }) => {
  const id = await bezoekPagina(page);
  await context.clearCookies();
  await vul(page, 'wensen', 'Na het verlopen getypt');
  await expect(page).toHaveURL(/\/inloggen$/);
  await login(page, BEHEERDER.email);
  await page.goto(`/dossiers/${id}/bezoek`);
  await opslagKlaar(page);
  expect((await serverData(page, id)).wensen).toBe('Na het verlopen getypt');
});
