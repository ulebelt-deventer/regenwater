// Admin pages: lists that filter on a checkbox must load on first open (box unchecked), and the navbar menus stay on screen.
import { expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, post, start } from './hulp.ts';

test('het accountmenu rechtsboven valt niet buiten de pagina', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-account').click();
  const menu = page.locator('.qa-uitloggen').locator('xpath=..');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Gebruikers toont bij openen meteen de actieve gebruikers', async ({ page }) => {
  const { beheerderId, klusserId } = await start(page);
  await page.goto('/gebruikers');
  await expect(page.locator(`.qa-gebruiker-${beheerderId}`)).toContainText(BEHEERDER.naam);
  await expect(page.locator(`.qa-gebruiker-${klusserId}`)).toContainText(KLUSSER.naam);
});

test('Feedback toont bij openen meteen de openstaande feedback', async ({ page }) => {
  await start(page);
  await post(page.request, '/api/feedback', { tekst: 'De knop is te klein', scherm: '/dossiers' });
  await page.goto('/beheer/feedback');
  await expect(page.locator('.qa-feedback-item')).toContainText('De knop is te klein');
});

test('Gebruikers staat als eerste in het Beheer-menu', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-beheer').click();
  await page.locator('.qa-nav-beheer + .dropdown-menu > :first-child.qa-nav-gebruikers').click();
  await expect(page).toHaveURL(/\/gebruikers$/);
});

test('Inloggen als vraagt eerst om bevestiging; annuleren laat je beheerder blijven', async ({ page }) => {
  const { klusserId } = await start(page);
  await page.goto(`/gebruikers/${klusserId}`);
  const inloggenAls = async () => {
    await page.locator('.qa-gebruiker-menu').click();
    await page.locator('.qa-inloggen-als').click();
    await expect(page.locator('.qa-bevestig')).toBeVisible();
  };

  await inloggenAls();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await expect(page.locator('.qa-als-banner')).toHaveCount(0);

  await inloggenAls();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page).toHaveURL(/\/dossiers$/);
  await expect(page.locator('.qa-als-banner')).toBeVisible();
});
