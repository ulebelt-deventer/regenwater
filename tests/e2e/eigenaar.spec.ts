// The dossier's eigenaar: the beheerder who gets its meldingen.
import { expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, login, naarDossier, post, start } from './hulp.ts';

test('een beheerder kiest een andere eigenaar in Status, en die krijgt dan de melding Klaar voor controle; een klusser ziet de eigenaar niet', async ({ page }) => {
  const { klusserId } = await start(page);
  const { id: tweedeId } = await post<{ id: number }>(page.request, '/api/test/gebruiker', { naam: 'Tessa Tweede', email: 'tessa@ulebelt.test', rol: 'beheerder' });
  const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });

  await naarDossier(page, id);
  const knop = page.locator('.qa-sectie-status .qa-eigenaar-knop');
  await expect(knop).toHaveText(BEHEERDER.naam);
  await knop.click();
  await expect(page.locator(`.qa-eigenaar-${klusserId}`)).toHaveCount(0);
  await page.locator(`.qa-eigenaar-${tweedeId}`).click();
  await expect(knop).toHaveText('Tessa Tweede');
  await page.reload();
  await expect(knop).toHaveText('Tessa Tweede');

  await login(page, KLUSSER.email);
  await naarDossier(page, id);
  await expect(page.locator('.qa-eigenaar')).toHaveCount(0);
  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
  await login(page, 'tessa@ulebelt.test');
  await page.goto('/');
  await expect(page.locator('.qa-bel-aantal')).toHaveText('1');
  await login(page, BEHEERDER.email);
  await page.reload();
  await expect(page.locator('.qa-nav-bel')).toBeVisible();
  await expect(page.locator('.qa-bel-aantal')).toHaveCount(0);
});

test('het vraagteken achter Eigenaar legt bij muis-hover uit wie de eigenaar is en wat die doet', async ({ page }) => {
  await start(page);
  const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
  await naarDossier(page, id);
  const label = page.locator('.qa-eigenaar-label');
  await expect(label).toBeVisible();
  await label.hover();
  await expect(page.locator('.qa-tip')).toHaveCount(0);
  const vraag = page.locator('.qa-eigenaar-uitleg');
  await expect(vraag).toBeVisible();
  await vraag.hover();
  await expect(page.locator('.qa-tip')).toBeVisible();
  await expect(page.locator('.qa-tip')).toContainText('die het dossier heeft aangemaakt');
  await expect(page.locator('.qa-tip')).toContainText('meldingen');
});
