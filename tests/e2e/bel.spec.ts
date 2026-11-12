// The navbar bell: in-app meldingen for a dossier's eigenaar.
import { type Page, expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, login, post, start } from './hulp.ts';

// Two dossiers of the admin, each handed off by the klusser with Klaar voor controle; the second is the newest melding.
async function tweeMeldingen(page: Page, klusserId: number): Promise<[number, number]> {
  const ids: number[] = [];
  for (let i = 0; i < 2; i++) {
    const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
    await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    ids.push(id);
  }
  await login(page, KLUSSER.email);
  for (const id of ids) await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
  await login(page, BEHEERDER.email);
  return [ids[0], ids[1]];
}

test('de bel telt de ongelezen meldingen; een melding openen gaat naar het dossier en markeert die als gelezen', async ({ page }) => {
  const { klusserId } = await start(page);
  const [eerste, tweede] = await tweeMeldingen(page, klusserId);
  await page.goto('/');
  await expect(page.locator('.qa-bel-aantal')).toHaveText('2');
  await page.locator('.qa-nav-bel').click();
  const items = page.locator('.qa-notificatie');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Plan van Aanpak klaar voor controle (Kees Klusser)');
  await expect(page.locator('.qa-notificatie-ongelezen')).toHaveCount(2);
  await items.first().click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${tweede}$`));
  await expect(page.locator('.qa-bel-aantal')).toHaveText('1');
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-notificatie-ongelezen')).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('href', `/dossiers/${eerste}`);
  await expect(items.first()).toHaveClass(/qa-notificatie-ongelezen/);
  // The melding about the dossier on screen isn't highlighted as the active link.
  await expect(page.locator(`.qa-notificatie[href="/dossiers/${tweede}"]`)).not.toHaveClass(/\bactive\b/);
});

test('een klusser heeft geen bel, en zonder meldingen zegt de bel dat', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-bel-leeg')).toBeVisible();
  await expect(page.locator('.qa-bel-aantal')).toHaveCount(0);
  await login(page, KLUSSER.email);
  await page.reload();
  await expect(page.locator('.qa-nav-account')).toBeVisible();
  await expect(page.locator('.qa-nav-bel')).toHaveCount(0);
});

test('op een telefoon valt het menu van de bel niet buiten het scherm', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const { klusserId } = await start(page);
  await tweeMeldingen(page, klusserId);
  await page.goto('/');
  await page.locator('.qa-nav-bel').click();
  const menu = page.locator('.bel-lijst').locator('xpath=..');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
