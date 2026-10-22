// The Inschrijving page: the one-line address with its pencil, the shared Notities, and the admin's "Inschrijving is compleet" that unlocks the bezoeker.
import { expect, test } from '@playwright/test';
import { kies, nieuwDossier, opslagKlaar, start, veld, vul } from './hulp.ts';

test('een gekozen adres staat op één regel; het potlood opent het zoekveld met de focus erin', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-adres-zoek')).toHaveCount(0);
  await page.locator('.qa-adres-wijzigen').click();
  await expect(page.locator('.qa-adres-zoek')).toBeFocused();
});

test('onderaan de Inschrijving staan de Notities van de dossierpagina, met de uitleg wie ze ziet', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(veld(page, 'notities').locator('.qa-hint')).toContainText('bezoeker en uitvoerder');
  await vul(page, 'notities', 'Gemeente en school hebben toestemming gegeven.');
  await opslagKlaar(page);
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-notities')).toContainText('Gemeente en school hebben toestemming gegeven.');
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
  await expect(knop).toHaveText('Klei (slecht doorlaatbaar)');
  await expect(veld(page, 'bodemsituatie').locator('.dropdown-menu')).toBeHidden();
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(knop).toHaveText('Klei (slecht doorlaatbaar)');

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

test('vanaf tabletbreedte delen de velden rijen; op een telefoon staat alles onder elkaar', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  const vak = async (sel: string) => { const l = page.locator(sel); await expect(l).toBeVisible(); return (await l.boundingBox())!; };
  const rij = async (sels: string[], deel: number) => {
    const boxen = await Promise.all(sels.map(vak));
    const breed = (await vak('.qa-inschrijving')).width;
    for (const b of boxen) {
      expect(Math.abs(b.y - boxen[0].y)).toBeLessThan(2);
      expect(Math.abs(b.width - breed / deel)).toBeLessThan(30);
    }
    for (let i = 1; i < boxen.length; i++) expect(boxen[i].x).toBeGreaterThan(boxen[i - 1].x);
  };
  await rij(['.qa-veld-bewoner_naam', '.qa-veld-bewoner_email', '.qa-veld-bewoner_telefoon'], 3);
  await rij(['.qa-veld-huur_koop', '.qa-veld-woningeigenaar', '.qa-veld-woningtype'], 3);
  await rij(['#veld-rioolstelsel-kop', '.qa-subsidiemail'], 2);
  await rij(['.qa-veld-kaart', '.qa-veld-straatfoto'], 2);
  await rij(['.qa-veld-boorprofiel', '.qa-veld-boorlocatie'], 2);
  const locatie = await vak('.qa-veld-boorlocatie');
  expect((await vak('#veld-bodemsituatie-kop')).y).toBeGreaterThan(locatie.y + locatie.height - 2);

  await page.setViewportSize({ width: 375, height: 800 });
  const naam = await vak('.qa-veld-bewoner_naam');
  expect((await vak('.qa-veld-bewoner_email')).y).toBeGreaterThan(naam.y + naam.height - 2);
  const kaart = await vak('.qa-veld-kaart');
  expect((await vak('.qa-veld-straatfoto')).y).toBeGreaterThan(kaart.y + kaart.height - 2);
  const boor = await vak('.qa-veld-boorprofiel');
  expect((await vak('.qa-veld-boorlocatie')).y).toBeGreaterThan(boor.y + boor.height - 2);
});

test('woningeigenaar, woningtype en bodemsituatie vullen hun kolom', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  for (const [naam, invoer] of [['woningeigenaar', 'select'], ['woningtype', 'select'], ['bodemsituatie', 'button.qa-invoer']]) {
    const v = veld(page, naam);
    await expect(v.locator(invoer)).toBeVisible();
    const kolom = await v.evaluate((e) => { const c = getComputedStyle(e); return e.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight); });
    expect(Math.abs((await v.locator(invoer).boundingBox())!.width - kolom)).toBeLessThan(2);
  }
});

test('de plattegrond staat vóór de straatfoto, en zijn hint onder de foto zegt dat je hier alvast kunt tekenen of het aan de bezoeker laat', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  expect((await page.locator('.qa-veld-kaart').boundingBox())!.x).toBeLessThan((await page.locator('.qa-veld-straatfoto').boundingBox())!.x);
  const hint = page.locator('.qa-veld-kaart .qa-kaart-hint');
  await expect(hint).toContainText('of laat dat aan de bezoeker ter plekke over');
  const slot = await page.locator('.qa-veld-kaart .qa-fotoslot').boundingBox();
  expect((await hint.boundingBox())!.y).toBeGreaterThan(slot!.y + slot!.height - 2);
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(page.locator('.qa-veld-kaart')).toContainText('Teken de daken');
  await expect(page.locator('.qa-veld-kaart')).not.toContainText('bezoeker ter plekke');
});

test('Rioolkaart naast het label is een gewone link, geen knop', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  const link = page.locator('#veld-rioolstelsel-kop .qa-rioolkaart');
  await expect(link).toHaveAttribute('href', /^https:\/\/deventer\.maps\.arcgis\.com\//);
  await expect(link).not.toHaveClass(/btn/);
});

test('boorlocatie is een tekstvak van twee regels', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  const vak = veld(page, 'boorlocatie').locator('textarea');
  await expect(vak).toHaveAttribute('rows', '2');
  await vak.fill('Voorbeeldplein,\nDeventer');
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(vak).toHaveValue('Voorbeeldplein,\nDeventer');
});

test('de bodemsituatie biedt de grondsoorten van de referentietabel, en de link naast zijn label opent die tabel', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await expect(page.locator('.qa-veld-boorprofiel .qa-doorlaatbaarheid')).toHaveCount(0);
  await page.locator('#veld-bodemsituatie-kop .qa-doorlaatbaarheid').click();
  const modal = page.locator('.qa-doorlaatbaarheid-modal');
  await expect(modal).toBeVisible();
  const rijen = modal.locator('tbody tr');
  await expect(rijen).toHaveCount(13);
  await expect(rijen.nth(9)).toHaveText(/Middelfijn \(duin\)zand\s*Goed/);
  await modal.locator('.btn-close').click();

  await veld(page, 'bodemsituatie').locator('button.qa-invoer').click();
  const opties = veld(page, 'bodemsituatie').locator('.dropdown-item:not(.qa-optie-leeg)');
  await expect(opties).toHaveCount(14);
  await expect(opties.nth(9)).toHaveText('Middelfijn (duin)zand (goed doorlaatbaar)');
  await expect(opties.last()).toHaveText('Anders...');
});

test('na Inschrijving is compleet staat onderaan alleen de terug-link, geen aparte knop naar het dossier', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.locator('.qa-inschrijving-klaar').click();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}#sectie-bezoeker$`));
  await page.goto(`/dossiers/${id}/inschrijving`);
  await expect(page.locator('.qa-controle')).toContainText('Inschrijving is compleet');
  await expect(page.locator('.qa-controle .qa-terugdraaien')).toBeVisible();
  await expect(page.locator('.qa-controle button')).toHaveCount(1);
  await expect(page.locator('.qa-terug')).toHaveCount(2);
});

test('een oude /intake-link gaat naar de Inschrijving', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/intake`);
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}/inschrijving$`));
  await expect(veld(page, 'bodemsituatie')).toBeVisible();
});
