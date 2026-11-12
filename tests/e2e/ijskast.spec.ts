// Dossier in ijskast doen, from the dossier menu.
import { expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, login, naarDossier, post, start } from './hulp.ts';

test('een dossier in de ijskast toont de reden voor iedereen, staat niet in de standaardlijst en kan er weer uit', async ({ page }) => {
  const { klusserId } = await start(page);
  const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
  await naarDossier(page, id);

  await page.locator('.qa-dossier-menu').click();
  await page.locator('.qa-menu-ijskast').click();
  const ok = page.locator('.qa-ijskast-modal .qa-actie-ok');
  await page.locator('.qa-ijskast-reden').fill('Bewoner verbouwt eerst de keuken');
  await expect(ok).toBeDisabled();
  await page.locator('.qa-ijskast-tot').fill('2026-04-01');
  await ok.click();
  const banner = page.locator('.qa-ijskast');
  await expect(banner).toContainText('In de ijskast tot 1 april 2026');
  await expect(banner).toContainText('Bewoner verbouwt eerst de keuken');

  await page.goto('/dossiers');
  await expect(page.locator('.qa-laden')).toHaveCount(0);
  await expect(page.locator(`.qa-dossiers .qa-dossier-${id}`)).toHaveCount(0);
  await page.goto('/dossiers?s_ijskast=ja');
  const label = page.locator(`.qa-dossiers .qa-dossier-${id} .qa-status`);
  await expect(label).toHaveText('In de ijskast tot 1 april 2026');
  await expect(label.locator('.bi-snow')).toBeVisible();
  await expect(label).toHaveCSS('background-color', 'rgb(219, 241, 250)');

  await login(page, KLUSSER.email);
  await naarDossier(page, id);
  await expect(page.locator('.qa-ijskast')).toContainText('Bewoner verbouwt eerst de keuken');

  await login(page, BEHEERDER.email);
  const { id: tweede } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${tweede}/ijskast`, { tot: '2026-04-01', reden: 'Wacht op de gemeente' });
  await naarDossier(page, tweede);
  await page.locator('.qa-dossier-menu').click();
  await page.locator('.qa-menu-ijskast-uit').click();
  await expect(page.locator('.qa-ijskast')).toHaveCount(0);
  await page.locator('.qa-dossier-menu').click();
  await expect(page.locator('.qa-menu-ijskast')).toBeVisible();
});
