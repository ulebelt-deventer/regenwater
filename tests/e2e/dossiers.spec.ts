// The Dossiers list's filter bar.
import { expect, test } from '@playwright/test';
import { nieuwDossier, start } from './hulp.ts';

test('een gekozen bezoeker-filter blijft staan nadat de lijst opnieuw is geladen', async ({ page }) => {
  const { klusserId } = await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  await page.goto('/dossiers');
  const bezoeker = page.locator('.qa-filter-bezoeker');
  for (const id of [String(klusserId), '', String(klusserId)]) {
    await bezoeker.selectOption(id);
    await expect(page).toHaveURL(id ? new RegExp(`bezoeker=${id}`) : /\/dossiers$/);
    await expect(page.locator('.qa-laden')).toHaveCount(0);
    await expect(bezoeker).toHaveValue(id);
  }
});

test('sorteren kies je in een compact menu dat de keuze toont, ook bij een tweede keuze', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  await page.goto('/dossiers');
  const knop = page.locator('.qa-sorteer');
  await expect(knop).toHaveText('Nieuwste');
  for (const [key, label] of [['adres', 'Adres'], ['activiteit', 'Laatste activiteit'], ['nieuw', 'Nieuwste']]) {
    await knop.click();
    await page.locator(`.qa-sorteer-${key}`).click();
    await expect(page).toHaveURL(key === 'nieuw' ? /\/dossiers$/ : new RegExp(`sorteer=${key}`));
    await expect(knop).toHaveText(label);
  }
});

test('op een desktop past de filterbalk op één regel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await page.goto('/dossiers');
  const velden = page.locator('.qa-filters > *');
  await expect(velden.first()).toBeVisible();
  const midden = await velden.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2));
  expect(Math.max(...midden) - Math.min(...midden)).toBeLessThan(4);
});
