// Admin pages: lists that filter on a checkbox must load on first open (box unchecked), and the navbar menus stay on screen.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { datum } from '../../src/shared/datum.ts';
import { NIEUWS } from '../../src/shared/nieuws.ts';
import { BEHEERDER, KLUSSER, login, nieuwDossier, post, start, zet } from './hulp.ts';

test('het accountmenu rechtsboven valt niet buiten de pagina', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-account').click();
  const menu = page.locator('.qa-uitloggen').locator('xpath=..');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Gebruikers toont bij openen meteen de actieve gebruikers', async ({ page }) => {
  const { beheerderId, klusserId } = await start(page);
  await page.goto('/gebruikers');
  await expect(page.locator(`.qa-gebruiker-${beheerderId}`)).toContainText(BEHEERDER.naam);
  await expect(page.locator(`.qa-gebruiker-${klusserId}`)).toContainText(KLUSSER.naam);
});

test('Laatst actief toont in de lijst en op de gebruikerspagina de datum met de tijd', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const { beheerderId } = await start(page);
  await page.goto('/gebruikers');
  const metTijd = /^\d{1,2} [a-z]+ \d{4} \d{2}:\d{2}$/;
  await expect(page.locator(`.qa-gebruiker-${beheerderId} .qa-laatst-actief`)).toHaveText(metTijd);
  await page.goto(`/gebruikers/${beheerderId}`);
  await expect(page.locator('.qa-laatst-actief')).toHaveText(metTijd);
});

test('Gebruikers sorteert standaard op Laatst actief, en kan ook op Laatst aangemaakt en Naam', async ({ page, browser }) => {
  await start(page);
  await post(page.request, '/api/test/klok', { verschuifDagen: 1 });
  await post(page.request, '/api/test/gebruiker', { naam: 'Bram Nooit', email: 'bram@ulebelt.test', rol: 'klusser' });
  const kees = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await post(kees.request, '/api/test/login', { email: KLUSSER.email });
  expect((await kees.request.get('/api/dossiers')).ok()).toBe(true);
  await kees.close();

  // Opening the page makes the beheerder the most recently active; Kees was created just after her.
  await page.goto('/gebruikers');
  const namen = page.locator('.qa-gebruiker td:first-child a');
  await expect(page.locator('.qa-sorteer')).toContainText('Laatst actief');
  await expect(namen).toHaveText([BEHEERDER.naam, KLUSSER.naam, 'Bram Nooit']);
  await page.locator('.qa-sorteer').click();
  await page.locator('.qa-sorteer-aangemaakt').click();
  await expect(namen).toHaveText(['Bram Nooit', KLUSSER.naam, BEHEERDER.naam]);
  await page.locator('.qa-sorteer').click();
  await page.locator('.qa-sorteer-naam').click();
  await expect(namen).toHaveText([BEHEERDER.naam, 'Bram Nooit', KLUSSER.naam]);
});

test('Feedback toont bij openen meteen de openstaande feedback', async ({ page }) => {
  await start(page);
  await post(page.request, '/api/feedback', { tekst: 'De knop is te klein', scherm: '/dossiers' });
  await page.goto('/beheer/feedback');
  await expect(page.locator('.qa-feedback-item')).toContainText('De knop is te klein');
});

test('Feedback geven opent met de cursor in het tekstvak', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-feedback').click();
  await expect(page.locator('.qa-feedback-modal .qa-feedback-tekst')).toBeFocused();
});

test('Gebruikers staat als eerste in het Beheer-menu', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-beheer').click();
  await page.locator('.qa-nav-beheer + .dropdown-menu > :first-child.qa-nav-gebruikers').click();
  await expect(page).toHaveURL(/\/gebruikers$/);
});

test('Inloggen als vraagt eerst om bevestiging; annuleren laat je beheerder blijven', async ({ page }) => {
  const { klusserId } = await start(page);
  await page.goto(`/gebruikers/${klusserId}`);
  const inloggenAls = async () => {
    await page.locator('.qa-gebruiker-menu').click();
    await page.locator('.qa-inloggen-als').click();
    await expect(page.locator('.qa-bevestig')).toBeVisible();
  };

  await inloggenAls();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await expect(page.locator('.qa-als-banner')).toHaveCount(0);

  await inloggenAls();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(page).toHaveURL(/\/dossiers$/);
  await expect(page.locator('.qa-als-banner')).toBeVisible();
});

test('de activiteit van een dossier noemt bij wat een beheerder als klusser deed beide namen', async ({ page }) => {
  const { klusserId } = await start(page);
  const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
  await post(page.request, `/api/auth/als/${klusserId}`);
  await zet(page, id, { tuinsituatie: 'als Kees' });
  await post(page.request, '/api/auth/als/stop');

  await page.goto(`/dossiers/${id}/activiteit`);
  const als = `${BEHEERDER.naam} (als ${KLUSSER.naam})`;
  await expect(page.locator('.qa-laatste')).toContainText(`door ${als}`);
  await expect(page.locator('.qa-type-dossier_gewijzigd')).toContainText(als);
});

test('E-mailsjablonen zijn knoppen naar een eigen bewerkpagina, met een kruimelpad terug naar de lijst', async ({ page }) => {
  await start(page);
  await page.goto('/beheer/sjablonen');
  await expect(page.locator('.qa-tekst')).toHaveCount(0);
  await page.locator('.qa-sjablonen .qa-sjabloon-subsidie_huur').click();
  await expect(page).toHaveURL(/\/beheer\/sjablonen\/subsidie_huur$/);

  await page.locator('.qa-tekst').fill('Beste {bewoner}');
  await page.locator('.qa-opslaan').click();
  await expect(page.locator('.qa-melding')).toBeVisible();
  await page.reload();
  await expect(page.locator('.qa-tekst')).toHaveValue('Beste {bewoner}');

  await page.locator('.qa-kruimel-terug').click();
  await expect(page).toHaveURL(/\/beheer\/sjablonen$/);
  await expect(page.locator('.qa-sjablonen')).toBeVisible();
});

test('een gebruiker heeft een kruimelpad terug naar Gebruikers', async ({ page }) => {
  const { klusserId } = await start(page);
  await page.goto(`/gebruikers/${klusserId}`);
  await expect(page.locator('.qa-kruimels')).toContainText(KLUSSER.naam);
  await page.locator('.qa-kruimel-terug').click();
  await expect(page).toHaveURL(/\/gebruikers$/);
});

test('de menuknoppen met alleen een pijltje hebben het caret-down-fill-icoon in het midden', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  const pijlMarge = (knop: string) => page.locator(knop).evaluate((el) => getComputedStyle(el, '::after').marginLeft);
  await page.goto(`/dossiers/${id}`);
  expect(await pijlMarge('.qa-dossier-menu')).toBe('0px');
  await page.goto(`/gebruikers/${klusserId}`);
  expect(await pijlMarge('.qa-gebruiker-menu')).toBe('0px');
  await page.goto('/dossiers');
  expect(await pijlMarge('.qa-dossiers-menu')).toBe('0px');
  expect(await page.locator('.qa-dossiers-menu').evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"\uF229"');
});

test('CSV downloaden staat in het menu naast Nieuw dossier, volgt de filters en downloadt het bestand', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto('/dossiers');
  await page.locator('.qa-filter-adres').fill('Walstraat');
  await expect(page).toHaveURL(/adres=Walstraat/);
  await page.locator('.qa-dossiers-menu').click();
  await expect(page.locator('.qa-csv')).toBeVisible();
  await expect(page.locator('.qa-csv')).toHaveAttribute('href', /^\/api\/dossiers\.csv\?.*adres=Walstraat/);

  const download = page.waitForEvent('download');
  await page.locator('.qa-csv').click();
  const bestand = readFileSync((await (await download).path())!, 'utf-8');
  expect(bestand).toContain('Dossier-ID;');
  expect(bestand).toContain('Walstraat');
});

test('Materialen verplaats je door een rij aan de greep te slepen, of met de pijltjestoetsen op de greep', async ({ page }) => {
  await start(page);
  await page.goto('/beheer/materialen');
  const namen = () => page.locator('.qa-materiaal-naam').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await expect(page.locator('.qa-materiaal')).not.toHaveCount(0);
  const voor = await namen();

  const greep = (await page.locator('.qa-greep').nth(2).boundingBox())!;
  const eerste = (await page.locator('.qa-materiaal').first().boundingBox())!;
  await page.mouse.move(greep.x + greep.width / 2, greep.y + greep.height / 2);
  await page.mouse.down();
  await page.mouse.move(greep.x + greep.width / 2, eerste.y + 5, { steps: 5 });
  await page.mouse.up();
  const gesleept = [voor[2], voor[0], voor[1], ...voor.slice(3)];
  await expect.poll(namen).toEqual(gesleept);
  await page.reload();
  await expect.poll(namen).toEqual(gesleept);

  const getoetst = [gesleept[1], gesleept[0], ...gesleept.slice(2)];
  await page.locator('.qa-greep').first().press('ArrowDown');
  await expect.poll(namen).toEqual(getoetst);
  await page.reload();
  await expect.poll(namen).toEqual(getoetst);
});

test('Uitleg: rechten staat in het Beheer-menu en toont per onderdeel wat bezoeker en uitvoerder mogen wijzigen', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-beheer').click();
  await page.locator('a[href="/uitleg/rechten"]').click();
  await expect(page.locator('.qa-rechten-inschrijving td').nth(1)).toHaveText('Niets');
  await expect(page.locator('.qa-rechten-bezoek td').nth(1)).toHaveText('Alles');
  await expect(page.locator('.qa-rechten-bezoek td').nth(2)).toHaveText('Niets');
  await expect(page.locator('.qa-rechten-uitvoering td').nth(2)).toHaveText('Alles');
  await expect(page.locator('.qa-rechten-details td').nth(1)).toHaveText('Notities, Bezoek-afspraak');
  await expect(page.locator('.qa-rechten-details td').nth(2)).toHaveText('Notities, Uitvoering gepland op');
});

test('Uitleg: statussen zegt per stap of die bij de bezoeker of de uitvoerder ligt, nergens bij "Klusser"', async ({ page }) => {
  await start(page);
  await page.goto('/uitleg/statussen');
  for (const stap of ['afspraak', 'bezoek', 'plan']) await expect(page.locator(`.qa-stap-${stap} .bij-bezoeker`)).toHaveText('Bezoeker');
  await expect(page.locator('.qa-stap-uitvoering .bij-uitvoerder')).toHaveText('Uitvoerder');
  await expect(page.locator('.qa-statussen')).toBeVisible();
  await expect(page.locator('.qa-statussen')).not.toContainText('Klusser');
});

test('Wat is er nieuw toont een rode stip tot de beheerder de pagina opent, met de nieuwste datum bovenaan', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await expect(page.locator('.qa-nav-beheer .qa-nieuw-stip')).toBeVisible();
  await page.locator('.qa-nav-beheer').click();
  await expect(page.locator('.qa-nav-nieuws .qa-nieuw-stip')).toBeVisible();
  await page.locator('.qa-nav-nieuws').click();

  await expect(page).toHaveURL(/\/beheer\/nieuw$/);
  await expect(page.locator('.qa-nieuws-datum').first().locator('.qa-nieuws-kop')).toHaveText(datum(NIEUWS[0].datum));
  await expect(page.locator('.qa-nieuws-datum').first().locator('li').first()).toHaveText(NIEUWS[0].groepen[0].punten[0]);
  await expect(page.locator('.qa-nav-beheer')).toBeVisible();
  await expect(page.locator('.qa-nieuw-stip')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.qa-nav-beheer')).toBeVisible();
  await expect(page.locator('.qa-nieuw-stip')).toHaveCount(0);
});

test('Uitleg: databeleid staat in het Beheer-menu, legt de procedures uit en is alleen voor beheerders', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-beheer').click();
  await page.locator('a[href="/uitleg/databeleid"]').click();
  await expect(page.locator('.qa-databeleid-titel')).toBeVisible();
  await expect(page.locator('.qa-databeleid-verzoek li')).toHaveCount(6);
  await expect(page.locator('.qa-databeleid-datalek ol li')).toHaveCount(4);
  await expect(page.locator('.qa-datalek-voorbeelden li')).toHaveCount(4);
  await expect(page.locator('main a[href="/privacy"]')).toBeVisible();

  await login(page, KLUSSER.email);
  await page.goto('/uitleg/databeleid');
  await expect(page.locator('.qa-alleen-beheerder')).toBeVisible();
  await expect(page.locator('.qa-databeleid-titel')).toHaveCount(0);
});

test('Wat is er nieuw is alleen voor beheerders', async ({ page }) => {
  await start(page);
  await login(page, KLUSSER.email);
  await page.goto('/beheer/nieuw');
  await expect(page.locator('.qa-alleen-beheerder')).toBeVisible();
  await expect(page.locator('.qa-nav-account')).toBeVisible();
  await expect(page.locator('.qa-nav-beheer')).toHaveCount(0);
});
