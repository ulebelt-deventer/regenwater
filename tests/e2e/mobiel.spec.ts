// Phone-width layout: the dossier lists turn into cards and no page scrolls sideways.
import { type Page, expect, test } from '@playwright/test';
import { ADRES, KLUSSER, login, naarDossier, nieuwDossier, start, wijsToe } from './hulp.ts';

test.use({ viewport: { width: 390, height: 844 } });

async function geenZijwaartsScrollen(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test('een beheerder ziet op een telefoon kaarten in plaats van de tabel, en een kaart opent het dossier', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await page.goto('/dossiers');
  await expect(page.locator('.qa-dossiers')).toBeHidden();
  const kaart = page.locator(`.qa-kaarten .qa-dossier-${id}`);
  await expect(kaart.locator('.qa-adres')).toHaveText(ADRES);
  await expect(kaart.locator('.qa-status')).toBeVisible();
  await geenZijwaartsScrollen(page);

  await kaart.click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));
  await geenZijwaartsScrollen(page);
});

test('een klusser ziet op een telefoon een kaart met de opdracht, nog niet aan zet tijdens de intake', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);

  await login(page, KLUSSER.email);
  await page.goto('/dossiers');
  await expect(page.locator('.qa-dossiers')).toBeHidden();
  const kaart = page.locator(`.qa-kaarten .qa-dossier-${id}`);
  await expect(kaart.locator('.qa-opdracht')).toHaveText('Bezoek');
  await expect(kaart.locator('.qa-opdracht-aan-zet')).toHaveCount(0);
  await expect(kaart.locator('.qa-adres')).toHaveText(ADRES);
  await geenZijwaartsScrollen(page);

  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(page.locator('.qa-bezoek')).toBeVisible();
  await geenZijwaartsScrollen(page);
});
