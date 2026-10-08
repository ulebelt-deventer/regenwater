// The Intake page: the one-line address with its pencil, and the admin's "Intake is compleet" that unlocks the bezoeker.
import { expect, test } from '@playwright/test';
import { nieuwDossier, start } from './hulp.ts';

test('een gekozen adres staat op één regel; het potlood opent het zoekveld met de focus erin', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-adres-zoek')).toHaveCount(0);
  await page.locator('.qa-adres-wijzigen').click();
  await expect(page.locator('.qa-adres-zoek')).toBeFocused();
});

test('met nog ontbrekende velden vraagt Intake is compleet eerst bevestiging, en pas daarna kun je een bezoeker toewijzen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-bezoeker-na-intake')).toBeVisible();
  await expect(page.locator('.qa-toewijzen-bezoeker')).toHaveCount(0);

  await page.goto(`/dossiers/${id}/intake`);
  await expect(page.locator('.qa-intake-ontbreekt')).toContainText('subsidiemail');
  await page.locator('.qa-intake-klaar').click();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page).toHaveURL(/\/intake$/);

  await page.locator('.qa-intake-klaar').click();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}#sectie-bezoeker$`));
  await expect(page.locator('.qa-toewijzen-bezoeker')).toBeVisible();
  await expect(page.locator('.qa-bezoeker-na-intake')).toHaveCount(0);
});

test('de link Kadastrale kaart opent de PDOK-viewer op het adres', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-kadastrale-kaart')).toHaveAttribute('href', /^https:\/\/app\.pdok\.nl\/viewer\/#x=207966&y=474195&.*kadastralekaart/);
});
