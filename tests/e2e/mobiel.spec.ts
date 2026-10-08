// Phone-width layout: the dossier lists turn into cards and no page scrolls sideways.
import { type Page, expect, test } from '@playwright/test';
import { ADRES, KLUSSER, login, nieuwDossier, post, start, subsidieMail, wijsToe } from './hulp.ts';

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
  await subsidieMail(page, 'koop');
  await wijsToe(page, 'bezoeker', klusserId, false);
  // Back in the intake: an admin undid "Intake is compleet" after assigning.
  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'intake_afgerond', aan: false });

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

test('op een telefoon is de navigatiebalk compact: klein logo met druppel en geen naam bij het accountmenu', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await expect(page.locator('.qa-logo-klein')).toBeVisible();
  await expect(page.locator('.qa-merk-druppel')).toBeVisible();
  await expect(page.locator('.qa-account-naam')).toBeHidden();
  await expect(page.locator('.qa-nav-account .bi-person-circle')).toBeVisible();
  await geenZijwaartsScrollen(page);
});

test('op een smalle telefoon past de navigatiebalk van een beheerder met DEV-label op één regel', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  await page.route('**/api/omgeving', (route) => route.fulfill({ json: { omgeving: 'dev' } }));
  await page.goto('/dossiers');
  await expect(page.locator('.qa-omgeving-label')).toBeVisible();
  await expect(page.locator('.qa-nav-beheer')).toBeVisible();
  const middens = await page.locator('.qa-navbar > div > *').evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  expect(new Set(middens).size).toBe(1);
});

test('op een telefoon tonen Gebruikers, een gebruiker en de uitlegpagina\'s kaarten zonder tabelkop en zonder zijwaarts scrollen', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await subsidieMail(page, 'koop');
  await wijsToe(page, 'bezoeker', klusserId, false);

  for (const pad of ['/gebruikers', `/gebruikers/${klusserId}`, '/uitleg/statussen', '/uitleg/aandacht', '/uitleg/rechten']) {
    await page.goto(pad);
    await expect(page.locator('.tabel-kaarten').first()).toBeVisible();
    for (const kop of await page.locator('.tabel-kaarten thead').all()) await expect(kop).toBeHidden();
    await geenZijwaartsScrollen(page);
  }
  await page.goto(`/gebruikers/${klusserId}`);
  const kaart = page.locator(`.qa-gebruiker-dossiers .qa-dossier-${id}`);
  await expect(kaart.locator('.qa-rol')).toHaveText('Bezoeker');
  const rol = (await kaart.locator('.qa-rol').boundingBox())!;
  const status = (await kaart.locator('.qa-status').boundingBox())!;
  expect(Math.abs(rol.y + rol.height / 2 - (status.y + status.height / 2))).toBeLessThan(4);
});

test('op een telefoon passen de e-mailsjablonen en een sjabloon met zijn tags in de breedte', async ({ page }) => {
  await start(page);
  await page.goto('/beheer/sjablonen');
  await expect(page.locator('.qa-sjabloon').first()).toBeVisible();
  await geenZijwaartsScrollen(page);
  await page.goto('/beheer/sjablonen/plan_bewoner_koop');
  await expect(page.locator('.qa-tags')).toBeVisible();
  await geenZijwaartsScrollen(page);
});
