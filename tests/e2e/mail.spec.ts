// The mail pop-up's "Handmatig verstuurd" sends nothing, so it must not be one mis-tap away from Versturen.
import { expect, test } from '@playwright/test';
import { emails, nieuwDossier, start } from './hulp.ts';

test('Handmatig verstuurd vraagt eerst bevestiging; annuleren markeert niets, bevestigen markeert zonder te mailen', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  const voor = (await emails(page)).length;
  await page.locator('.qa-mail-subsidie_huur').click();
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();

  await modal.locator('.qa-mail-handmatig').click();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(page.locator('.qa-subsidie-verstuurd')).toHaveCount(0);

  await modal.locator('.qa-mail-handmatig').click();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.qa-subsidie-verstuurd')).toBeVisible();
  expect((await emails(page)).length).toBe(voor);
});

test('na de subsidiemail wordt de knop een link Opnieuw mailen met dezelfde variant', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  const knop = page.locator('.qa-mail-subsidie_huur');
  await expect(knop).toHaveText('📧 Mail bewoner: subsidiabel, huurwoning');
  await expect(knop).toHaveClass(/btn-outline-primary/);
  await knop.click();
  await page.locator('.qa-mail .qa-mail-versturen').click();
  await expect(page.locator('.qa-subsidie-verstuurd')).toBeVisible();
  await expect(knop).toHaveText('Opnieuw mailen: subsidiabel, huurwoning');
  await expect(knop).toHaveClass(/btn-link/);
  await expect(knop).not.toHaveClass(/btn-outline-primary/);
  await knop.click();
  await expect(page.locator('.qa-mail .qa-mail-aan')).toBeVisible();
});

test('Handmatig verstuurd staat onder Versturen, en de pop-up ligt boven de opslag-indicator', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  await page.locator('.qa-mail-subsidie_huur').click();
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();
  const versturen = (await modal.locator('.qa-mail-versturen').boundingBox())!;
  const handmatig = (await modal.locator('.qa-mail-handmatig').boundingBox())!;
  expect(handmatig.y).toBeGreaterThanOrEqual(versturen.y + versturen.height);

  const opslag = (await page.locator('.opslag').boundingBox())!;
  const bovenste = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)!.closest('.opslag, .qa-mail')!.className, [opslag.x + opslag.width / 2, opslag.y + opslag.height / 2]);
  expect(bovenste).toContain('qa-mail');
});
