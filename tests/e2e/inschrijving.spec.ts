// The Inschrijving page: the one-line address with its pencil, and the admin's "Inschrijving is compleet" that unlocks the bezoeker.
import { expect, test } from '@playwright/test';
import { kies, nieuwDossier, start, veld } from './hulp.ts';

test('een gekozen adres staat op één regel; het potlood opent het zoekveld met de focus erin', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-adres-zoek')).toHaveCount(0);
  await page.locator('.qa-adres-wijzigen').click();
  await expect(page.locator('.qa-adres-zoek')).toBeFocused();
});

test('met nog ontbrekende velden vraagt Inschrijving is compleet eerst bevestiging, en pas daarna kun je een bezoeker toewijzen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-bezoeker-na-inschrijving')).toBeVisible();
  await expect(page.locator('.qa-toewijzen-bezoeker')).toHaveCount(0);

  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(page.locator('.qa-inschrijving-ontbreekt')).toContainText('subsidiemail');
  await page.locator('.qa-inschrijving-klaar').click();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page).toHaveURL(/\/inschrijving$/);

  await page.locator('.qa-inschrijving-klaar').click();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}#sectie-bezoeker$`));
  await expect(page.locator('.qa-toewijzen-bezoeker')).toBeVisible();
  await expect(page.locator('.qa-bezoeker-na-inschrijving')).toHaveCount(0);
});

test('de link Kadastrale kaart opent de PDOK-viewer op het adres', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-kadastrale-kaart')).toHaveAttribute('href', /^https:\/\/app\.pdok\.nl\/viewer\/#x=207966&y=474195&.*kadastralekaart/);
});

test('bodemsituatie is een menu dat de keuze op de knop toont en op een telefoon binnen het scherm blijft', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  const knop = veld(page, 'bodemsituatie').locator('button.qa-invoer');
  await expect(knop).toHaveText('- kies -');
  await kies(page, 'bodemsituatie', 'klei');
  await expect(knop).toHaveText('Klei, slecht doorlaatbaar');
  await expect(veld(page, 'bodemsituatie').locator('.dropdown-menu')).toBeHidden();
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(knop).toHaveText('Klei, slecht doorlaatbaar');

  await page.setViewportSize({ width: 375, height: 800 });
  await knop.click();
  const menu = veld(page, 'bodemsituatie').locator('.dropdown-menu');
  await expect(menu).toBeVisible();
  const b = (await menu.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(375);
});

test('kies je Anders, dan krijgt het namelijk-veld de focus; het staat op dezelfde regel, behalve op een telefoon', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await kies(page, 'bodemsituatie', 'anders');
  const namelijk = veld(page, 'bodemsituatie').locator('.qa-anders');
  await expect(namelijk).toBeFocused();
  const knop = veld(page, 'bodemsituatie').locator('button.qa-invoer');
  await expect(knop).toHaveText('Anders');
  const midden = async (l: typeof knop) => { const b = (await l.boundingBox())!; return b.y + b.height / 2; };
  expect(Math.abs((await midden(knop)) - (await midden(namelijk)))).toBeLessThan(4);

  await page.setViewportSize({ width: 375, height: 800 });
  expect((await namelijk.boundingBox())!.y).toBeGreaterThan((await knop.boundingBox())!.y + (await knop.boundingBox())!.height);

  await namelijk.fill('Grind');
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(namelijk).toHaveValue('Grind');
  await expect(namelijk).not.toBeFocused();
});

test('een oude /intake-link gaat naar de Inschrijving', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/intake`);
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}/inschrijving$`));
  await expect(veld(page, 'bodemsituatie')).toBeVisible();
});
