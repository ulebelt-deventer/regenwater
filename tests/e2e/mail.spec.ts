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
