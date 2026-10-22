// After a deploy, an open page notices the server serves a newer build and offers to reload. A device asks at most once every 15 minutes.
import { type Page, expect, test } from '@playwright/test';
import { start } from './hulp.ts';

const SLEUTEL = 'regenton.versieGecontroleerd';
const isVersieCheck = (url: string | URL) => new URL(url).pathname === '/api/versie';

// What returning to the app from the background fires.
const terugInBeeld = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// Returning after more than 15 minutes asks the server again.
async function terugNaEenKwartier(page: Page): Promise<URL> {
  const antwoord = page.waitForResponse((r) => isVersieCheck(r.url()));
  await page.evaluate((k) => localStorage.setItem(k, String(Date.now() - 16 * 60_000)), SLEUTEL);
  await terugInBeeld(page);
  return new URL((await antwoord).url());
}

async function nieuwerOpServer(page: Page): Promise<void> {
  await page.route(isVersieCheck, (r) => r.fulfill({ json: { versie: 'nieuwer' } }));
}

test('de pagina noemt haar eigen versie, de server die van de pagina die hij uitlevert, dus zonder deploy verschijnt geen melding', async ({ page }) => {
  await start(page);
  await page.goto('/');
  const eigen = await page.locator('meta[name="app-versie"]').getAttribute('content');
  expect(eigen).toMatch(/^[0-9a-f]{12}(-dirty)?$/);
  const res = await page.request.get('/api/versie');
  expect(await res.json()).toEqual({ versie: eigen });
  expect((await terugNaEenKwartier(page)).searchParams.get('versie')).toBe(eigen);
  // The comparison runs after the response arrives; give it a moment before asserting nothing appeared.
  await page.waitForTimeout(200);
  await expect(page.locator('.qa-nieuwe-versie')).toHaveCount(0);
});

test('binnen een kwartier na de vorige controle vraagt de app de server niets', async ({ page }) => {
  await start(page);
  const verzoeken: string[] = [];
  page.on('request', (r) => {
    if (isVersieCheck(r.url())) verzoeken.push(r.url());
  });
  await page.goto('/');
  await expect.poll(() => verzoeken.length).toBe(1);
  await terugInBeeld(page);
  await page.reload();
  await terugInBeeld(page);
  await page.waitForTimeout(200);
  expect(verzoeken).toHaveLength(1);
});

test('na een deploy verschijnt een melding, en Vernieuwen laadt de pagina opnieuw', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await nieuwerOpServer(page);
  await page.evaluate(() => ((window as unknown as { oud: boolean }).oud = true));
  await terugNaEenKwartier(page);
  await expect(page.locator('.qa-nieuwe-versie')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.locator('.qa-vernieuwen').click()]);
  expect(await page.evaluate(() => (window as unknown as { oud?: boolean }).oud)).toBeUndefined();
});

test('na wegklikken blijft de pagina op deze versie en vraagt de server niets meer', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await nieuwerOpServer(page);
  await page.evaluate(() => ((window as unknown as { oud: boolean }).oud = true));
  await terugNaEenKwartier(page);
  await page.locator('.qa-nieuwe-versie-sluiten').click();
  await expect(page.locator('.qa-nieuwe-versie')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { oud?: boolean }).oud)).toBe(true);
  const verzoeken: string[] = [];
  page.on('request', (r) => {
    if (isVersieCheck(r.url())) verzoeken.push(r.url());
  });
  await page.evaluate((k) => localStorage.setItem(k, String(Date.now() - 16 * 60_000)), SLEUTEL);
  await terugInBeeld(page);
  await page.waitForTimeout(200);
  expect(verzoeken).toHaveLength(0);
  await expect(page.locator('.qa-nieuwe-versie')).toHaveCount(0);
});
