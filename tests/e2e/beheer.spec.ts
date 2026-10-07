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
