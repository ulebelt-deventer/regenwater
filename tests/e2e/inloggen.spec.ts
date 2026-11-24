// Logging in through the real pages: the code typed on a phone and the link clicked on a computer. Rate limits and expiry are in src/server/auth.test.ts.
import { type Page, expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, emails, start } from './hulp.ts';

// Asks for a login mail from the logged-out login page and returns its code and link (path and hash, so the host doesn't matter).
async function vraagCode(page: Page, email: string): Promise<{ code: string; link: string }> {
  await page.context().clearCookies();
  await page.goto('/inloggen');
  await page.locator('.qa-login-email').fill(email);
  await page.locator('.qa-login-aanvragen').click();
  await expect(page.locator('.qa-login-verstuurd')).toContainText(email);
  const m = (await emails(page)).findLast((e) => e.aan === email)!;
  const code = /inlogcode is:\s+(\S+)/.exec(m.tekst)![1];
  const url = new URL(/(https?:\/\/\S+\/inloggen\/link#\S+)/.exec(m.tekst)![1]);
  return { code, link: `${url.pathname}${url.hash}` };
}

const ingelogd = async (page: Page) => (await page.request.get('/api/auth/me')).status();

test('de inlogpagina toont de navbar met het logo maar zonder iets om op te klikken', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await page.goto('/inloggen');
  const navbar = page.locator('.qa-navbar-uitgelogd');
  await expect(navbar.locator('.qa-logo-klein')).toBeAttached();
  await expect(navbar.locator('img[src="/ulebelt-logo.svg"]')).toBeVisible();
  await expect(navbar.locator('a, button')).toHaveCount(0);
  await expect(page.locator('.qa-nav-dossiers')).toHaveCount(0);
});

test('met de code uit de e-mail logt een klusser in en komt op Mijn dossiers', async ({ page }) => {
  await start(page);
  const { code } = await vraagCode(page, KLUSSER.email);
  await page.locator('.qa-login-code').fill(code);
  await page.locator('.qa-login-inloggen').click();
  await expect(page).toHaveURL(/\/dossiers$/);
  await expect(page.locator('.qa-titel')).toHaveText('Mijn dossiers');
});

test('een verkeerde code geeft een foutmelding en logt niet in', async ({ page }) => {
  await start(page);
  const { code } = await vraagCode(page, KLUSSER.email);
  await page.locator('.qa-login-code').fill(code === '000000' ? '111111' : '000000');
  await page.locator('.qa-login-inloggen').click();
  await expect(page.locator('.qa-login-fout')).toBeVisible();
  await expect(page).toHaveURL(/\/inloggen$/);
  expect(await ingelogd(page)).toBe(401);
});

test('alleen het openen van de link logt niet in; de knop wel, en een beheerder komt op het overzicht', async ({ page }) => {
  await start(page);
  const { link } = await vraagCode(page, BEHEERDER.email);
  await page.goto(link);
  await expect(page.locator('.qa-link-uitleg')).toContainText('bijna ingelogd');
  await expect(page.locator('.qa-link-inloggen')).toBeVisible();
  expect(await ingelogd(page)).toBe(401);

  await page.locator('.qa-link-inloggen').click();
  await expect(page).toHaveURL(/\/$/);
  expect(await ingelogd(page)).toBe(200);
});

test('een link die al gebruikt is geeft een foutmelding met een weg naar een nieuwe code', async ({ page }) => {
  await start(page);
  const { link } = await vraagCode(page, KLUSSER.email);
  await page.goto(link);
  await page.locator('.qa-link-inloggen').click();
  await expect(page).toHaveURL(/\/dossiers$/);

  await page.context().clearCookies();
  await page.goto(link);
  await page.locator('.qa-link-inloggen').click();
  await expect(page.locator('.qa-login-fout')).toBeVisible();
  await expect(page.locator('.qa-login-fout a')).toHaveAttribute('href', '/inloggen');
  expect(await ingelogd(page)).toBe(401);
});

test('het e-mailveld en daarna het codeveld krijgen de focus', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await page.goto('/inloggen');
  await expect(page.locator('.qa-login-email')).toBeFocused();
  await page.locator('.qa-login-email').fill(KLUSSER.email);
  await page.locator('.qa-login-aanvragen').click();
  await expect(page.locator('.qa-login-code')).toBeFocused();
});

test('een uitgelogde link naar een dossier vult het e-mailadres in en komt na inloggen eenmalig terug op dat dossier', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await page.locator('.qa-nieuw-dossier').click();
  await expect(page).toHaveURL(/\/dossiers\/\d+\/inschrijving$/);
  const id = Number(/\/dossiers\/(\d+)\//.exec(page.url())![1]);
  await page.context().clearCookies();

  await page.goto(`/dossiers/${id}?email=${encodeURIComponent(BEHEERDER.email)}`);
  await expect(page).toHaveURL(/\/inloggen\?email=/);
  await expect(page.locator('.qa-login-email')).toHaveValue(BEHEERDER.email);
  await expect(page.locator('.qa-login-aanvragen')).toBeFocused();
  await page.locator('.qa-login-aanvragen').click();
  const m = (await emails(page)).findLast((e) => e.aan === BEHEERDER.email)!;
  await page.locator('.qa-login-code').fill(/inlogcode is:\s+(\S+)/.exec(m.tekst)![1]);
  await page.locator('.qa-login-inloggen').click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));

  const { code } = await vraagCode(page, BEHEERDER.email);
  await page.locator('.qa-login-code').fill(code);
  await page.locator('.qa-login-inloggen').click();
  await expect(page).toHaveURL(/\/$/);
});

test('de privacypagina is uitgelogd te lezen, zonder doorsturen naar inloggen', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await page.goto('/privacy');
  await expect(page.locator('.qa-privacy-titel')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('.qa-privacy-titel')).toBeVisible();
});

test('de pagina Over deze app is uitgelogd te openen via de footer en linkt naar de code op GitHub', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await page.goto('/inloggen');
  await page.locator('.qa-footer-over').click();
  await expect(page.locator('.qa-over-titel')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/over-de-app$/);
  await expect(page.locator('.qa-over-github')).toHaveAttribute('href', 'https://github.com/ulebelt-deventer/regenwater');
});
