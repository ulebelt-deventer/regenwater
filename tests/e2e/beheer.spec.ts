// Admin pages: lists that filter on a checkbox must load on first open (box unchecked), and the navbar menus stay on screen.
import { expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, nieuwDossier, post, start } from './hulp.ts';

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

test('CSV downloaden staat in het menu naast Nieuw dossier en volgt de filters', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await page.locator('.qa-filter-adres').fill('Walstraat');
  await expect(page).toHaveURL(/adres=Walstraat/);
  await page.locator('.qa-dossiers-menu').click();
  await expect(page.locator('.qa-csv')).toBeVisible();
  await expect(page.locator('.qa-csv')).toHaveAttribute('href', /^\/api\/dossiers\.csv\?.*adres=Walstraat/);
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
