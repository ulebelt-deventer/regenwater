// The dossier's eigenaar: the beheerder who gets its meldingen.
import { expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, emails, login, naarDossier, post, start } from './hulp.ts';

test('een beheerder kiest een andere eigenaar in Status, en die krijgt dan Klaar voor controle; een klusser ziet de eigenaar niet', async ({ page }) => {
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
  expect((await emails(page)).at(-1)).toMatchObject({ aan: 'tessa@ulebelt.test', onderwerp: expect.stringContaining('Plan van Aanpak klaar voor controle') });
});
