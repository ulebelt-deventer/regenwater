// The Dossiers list's filter bar.
import { expect, test } from '@playwright/test';
import { KLUSSER, nieuwDossier, post, start } from './hulp.ts';

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

test('het eigenaar-filter toont alleen de dossiers van de gekozen beheerder', async ({ page }) => {
  const { beheerderId } = await start(page);
  const { id: tweedeId } = await post<{ id: number }>(page.request, '/api/test/gebruiker', { naam: 'Tessa Tweede', email: 'tessa@ulebelt.test', rol: 'beheerder' });
  const { id: vanMij } = await post<{ id: number }>(page.request, '/api/dossiers');
  const { id: vanTessa } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${vanTessa}/eigenaar`, { gebruiker_id: tweedeId });
  await page.goto('/dossiers');
  const eigenaar = page.locator('.qa-filter-eigenaar');
  await expect(page.locator('.qa-dossiers .qa-dossier')).toHaveCount(2);
  const volgorde = await page.locator('.qa-filters select').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('qa-filter-'))));
  expect(volgorde.indexOf('qa-filter-eigenaar')).toBe(volgorde.indexOf('qa-filter-bezoeker') - 1);
  await eigenaar.selectOption(String(tweedeId));
  await expect(page).toHaveURL(new RegExp(`eigenaar=${tweedeId}`));
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanTessa}`)).toBeVisible();
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanMij}`)).toHaveCount(0);
  await eigenaar.selectOption(String(beheerderId));
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanMij}`)).toBeVisible();
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanTessa}`)).toHaveCount(0);
  await expect(eigenaar).toHaveValue(String(beheerderId));
});

test('na een dossier openen en de terugknop van de browser staan de filters er nog', async ({ page }) => {
  await start(page);
  const { id: tweedeId } = await post<{ id: number }>(page.request, '/api/test/gebruiker', { naam: 'Tessa Tweede', email: 'tessa@ulebelt.test', rol: 'beheerder' });
  const { id: vanMij } = await post<{ id: number }>(page.request, '/api/dossiers');
  const { id: vanTessa } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${vanTessa}/eigenaar`, { gebruiker_id: tweedeId });
  await page.goto('/dossiers');
  await page.locator('.qa-filter-eigenaar').selectOption(String(tweedeId));
  await page.locator('.qa-sorteer').click();
  await page.locator('.qa-sorteer-oud').click();
  await expect(page).toHaveURL(/sorteer=oud/);
  await expect(page.locator('.qa-dossiers .qa-dossier')).toHaveCount(1);
  const gefilterd = page.url();

  await page.locator(`.qa-dossiers .qa-dossier-${vanTessa} .qa-adres`).click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${vanTessa}$`));
  await page.goBack();

  await expect(page).toHaveURL(gefilterd);
  await expect(page.locator('.qa-filter-eigenaar')).toHaveValue(String(tweedeId));
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanTessa}`)).toBeVisible();
  await expect(page.locator(`.qa-dossiers .qa-dossier-${vanMij}`)).toHaveCount(0);
});

test('de lijst toont bezoeker en uitvoerder elk apart (grijze -- als er geen is), zonder kolom Laatste activiteit, ook op de kaart op een telefoon', async ({ page }) => {
  const { klusserId } = await start(page);
  const { id: uitvoerderId } = await post<{ id: number }>(page.request, '/api/test/gebruiker', { naam: 'Ria Uitvoer', email: 'ria@ulebelt.test', rol: 'klusser' });
  const { id: beide } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${beide}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
  await post(page.request, `/api/dossiers/${beide}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: uitvoerderId });
  const { id: alleenUitvoerder } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${alleenUitvoerder}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: uitvoerderId });

  await page.goto('/dossiers');
  const rij = (id: number) => page.locator(`.qa-dossiers .qa-dossier-${id}`);
  await expect(rij(beide).locator('.qa-bezoeker')).toHaveText(KLUSSER.naam);
  await expect(rij(beide).locator('.qa-uitvoerder')).toHaveText('Ria Uitvoer');
  await expect(rij(alleenUitvoerder).locator('.qa-bezoeker')).toHaveText('--');
  await expect(rij(alleenUitvoerder).locator('.qa-bezoeker .text-body-tertiary')).toBeVisible();
  await expect(page.locator('.qa-dossiers thead')).not.toContainText('Laatste activiteit');
  await expect(rij(alleenUitvoerder).locator('.qa-uitvoerder')).toHaveText('Ria Uitvoer');

  await page.setViewportSize({ width: 390, height: 844 });
  const kaart = (id: number) => page.locator(`.qa-kaarten .qa-dossier-${id}`);
  await expect(kaart(beide)).toBeVisible();
  await expect(kaart(beide)).toContainText(`Bezoeker: ${KLUSSER.naam} · Uitvoerder: Ria Uitvoer`);
  await expect(kaart(alleenUitvoerder)).toContainText('Uitvoerder: Ria Uitvoer');
  await expect(kaart(alleenUitvoerder)).not.toContainText('Bezoeker');
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
