// A reload keeps your place on a long form, although the page only gets its length once its data has loaded.
import { type Page, expect, test } from '@playwright/test';
import { nieuwDossier, start, zet } from './hulp.ts';

test.use({ viewport: { width: 390, height: 600 } });

const hoogte = (page: Page) => page.evaluate(() => window.scrollY);
const laatsteBlok = (page: Page) => page.locator('.qa-regenpijp').last();

// A Bezoek page several screens long, scrolled to its last regenpijp. Returns the dossier and the position.
async function langeBezoekPagina(page: Page): Promise<{ id: number; y: number }> {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[5, 5]] },
      { id: 'r3', type: 'regenpijp', p: [[10, 5]] },
    ],
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(laatsteBlok(page)).toBeVisible();
  await laatsteBlok(page).evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }));
  const y = await hoogte(page);
  expect(y).toBeGreaterThan(1000);
  return { id, y };
}

async function traagDossier(page: Page, id: number): Promise<void> {
  await page.route(`**/api/dossiers/${id}`, async (r) => {
    await new Promise((ok) => setTimeout(ok, 500));
    await r.continue();
  });
}

test('verversen brengt je terug op dezelfde plek op een lang formulier, ook als het dossier traag laadt', async ({ page }) => {
  const { id, y } = await langeBezoekPagina(page);
  await traagDossier(page, id);
  await page.reload();
  await expect(laatsteBlok(page)).toBeVisible();
  await expect.poll(() => hoogte(page)).toBeCloseTo(y, 0);
});

test('wie tijdens het laden zelf scrolt, wordt daarna niet teruggezet', async ({ page }) => {
  const { id } = await langeBezoekPagina(page);
  await traagDossier(page, id);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('.qa-navbar')).toBeVisible();
  await page.mouse.wheel(0, 10);
  await expect(laatsteBlok(page)).toBeVisible();
  // The restore would run right after the blocks appear; give it a moment before asserting it didn't.
  await page.waitForTimeout(200);
  expect(await hoogte(page)).toBeLessThan(100);
});

test('de pagina opnieuw openen via een link of adres begint gewoon bovenaan', async ({ page }) => {
  const { id } = await langeBezoekPagina(page);
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(laatsteBlok(page)).toBeVisible();
  await page.waitForTimeout(200);
  expect(await hoogte(page)).toBe(0);
});
