// The norm per gemeente: managed under Beheer, fixed when the Bezoek first opens, and named wherever the waterberging shows.
import { expect, test, type Page } from '@playwright/test';
import { ja, nieuwDossier, naarDossier, planTekst, start, zet } from './hulp.ts';

const KAART = {
  kaart_annotaties: [
    { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
  ],
  'dak.d1.m2': 24,
};

async function voegNormToe(page: Page, gemeente: string, mm: number): Promise<void> {
  await page.goto('/beheer/normafvoer');
  await page.locator('.qa-norm-nieuw-gemeente').fill(gemeente);
  await page.locator('.qa-norm-nieuw-mm').fill(String(mm));
  await page.locator('.qa-norm-voeg-toe').click();
}

const rij = (page: Page, gemeente: string) => page.locator('.qa-norm-rij', { hasText: gemeente });

async function naarBezoek(page: Page, id: number): Promise<void> {
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(page.locator('.qa-waterberging')).toContainText('liter');
}

test('Beheer begint met de standaardnorm, die niet te verwijderen is', async ({ page }) => {
  await start(page);
  await page.goto('/beheer/normafvoer');
  await expect(page.locator('.qa-norm-rij')).toHaveCount(1);
  await expect(page.locator('.qa-norm-gemeente')).toHaveText('Standaard (overige gemeenten)');
  await expect(page.locator('.qa-norm-rij .qa-norm-mm')).toHaveValue('20');
  await expect(page.locator('.qa-norm-verwijder')).toHaveCount(0);
});

test('een gemeente toevoegen, wijzigen, nakijken en verwijderen werkt, en een onbekende naam wordt eerst nagevraagd', async ({ page }) => {
  await start(page);
  await voegNormToe(page, 'Raalte', 10);
  await expect(rij(page, 'Raalte').locator('.qa-norm-mm')).toHaveValue('10');
  await expect(page.locator('.qa-norm-nieuw-gemeente')).toHaveValue('');

  await rij(page, 'Raalte').locator('.qa-norm-mm').fill('12');
  await rij(page, 'Raalte').locator('.qa-norm-mm').blur();
  await expect.poll(async () => {
    await page.reload();
    return rij(page, 'Raalte').locator('.qa-norm-mm').inputValue();
  }).toBe('12');

  await voegNormToe(page, 'Raalt', 10);
  await ja(page);
  await expect(rij(page, 'Raalt').first()).toBeVisible();
  await expect(page.locator('.qa-norm-rij')).toHaveCount(3);

  await rij(page, 'Raalte').locator('.qa-norm-verwijder').click();
  await ja(page);
  await expect(page.locator('.qa-norm-rij')).toHaveCount(2);
});

test('het Bezoek rekent met de norm van de gemeente, en noemt die in de voetnoot en de uitleg en in het Plan', async ({ page }) => {
  await start(page);
  await voegNormToe(page, 'Deventer', 10);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, KAART);
  await naarBezoek(page, id);
  await expect(page.locator('.qa-waterberging')).toContainText('240 liter');
  await expect(page.locator('.qa-waterberging')).toContainText('× 10 mm');
  await expect(page.locator('.qa-normafvoer')).toHaveText('per regenpijp gebaseerd op normafvoer 10 mm regenwater (gemeente Deventer)');
  await page.locator('.qa-waterberging-uitleg').hover();
  await expect(page.locator('.qa-tip')).toContainText('(gemeente Deventer)');
  expect(await planTekst(page, id)).toContain('normafvoer 10 mm regenwater (gemeente Deventer)');
});

test('zonder eigen rij zegt het dossier dat het de standaardnorm gebruikt', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, KAART);
  await naarBezoek(page, id);
  await expect(page.locator('.qa-normafvoer')).toContainText('normafvoer 20 mm regenwater (standaardnorm)');
  expect(await planTekst(page, id)).toContain('normafvoer 20 mm regenwater (standaardnorm)');
});

test('een dossier houdt de norm van het eerste openen van het Bezoek, een later dossier krijgt de nieuwe', async ({ page }) => {
  await start(page);
  const eerder = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, eerder, KAART);
  const later = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, later, KAART);
  await naarBezoek(page, eerder);
  await expect(page.locator('.qa-waterberging')).toContainText('480 liter');

  await page.goto('/beheer/normafvoer');
  await page.locator('.qa-norm-rij .qa-norm-mm').fill('10');
  const opgeslagen = page.waitForResponse((r) => r.url().includes('/api/normafvoeren/') && r.request().method() === 'PATCH');
  await page.locator('.qa-norm-rij .qa-norm-mm').blur();
  await opgeslagen;

  await naarBezoek(page, eerder);
  await expect(page.locator('.qa-waterberging')).toContainText('480 liter');
  await naarBezoek(page, later);
  await expect(page.locator('.qa-waterberging')).toContainText('240 liter');
});

test('een beheerder past de norm van één dossier aan, met een reden die in de activiteit staat', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, KAART);
  await naarBezoek(page, id);
  await page.locator('.qa-norm-wijzigen').click();
  await page.locator('.modal .qa-norm-mm').fill('15');
  await page.locator('.qa-norm-reden').fill('Hoge grondwaterstand');
  await page.locator('.qa-norm-opslaan').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.qa-waterberging')).toContainText('360 liter');
  await expect(page.locator('.qa-normafvoer')).toContainText('(aangepast voor dit dossier)');
  await page.locator('.qa-waterberging-uitleg').hover();
  await expect(page.locator('.qa-tip')).toContainText('normafvoer 15 mm');

  await page.goto(`/dossiers/${id}/activiteit`);
  await expect(page.locator('.qa-activiteit-lijst')).toContainText('20 mm → 15 mm. Hoge grondwaterstand');
});

test('het Beheer-menu heeft een link naar Normafvoer', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await naarDossier(page, id);
  await page.getByRole('button', { name: 'Beheer' }).click();
  await page.locator('.qa-nav-normafvoer').click();
  await expect(page.locator('.qa-normen')).toBeVisible();
});
