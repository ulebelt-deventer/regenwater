// The DEV or TEST label in the navbar, the staging banner, the /proberen sign-up and the proefomgeving banner. The e2e server reports no omgeving, so these tests fake the API answers they depend on.
import { type Page, expect, test } from '@playwright/test';
import type { Omgeving } from '../../src/shared/types.ts';
import { start } from './hulp.ts';

async function alsOmgeving(page: Page, omgeving: Omgeving): Promise<void> {
  await page.route('**/api/omgeving', (route) => route.fulfill({ json: { omgeving } }));
}

test('op de live site staat er geen label in de navbar', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await expect(page.locator('.qa-nav-dossiers')).toBeVisible();
  await expect(page.locator('.qa-omgeving-label')).toHaveCount(0);
  await expect(page.locator('.qa-staging-banner')).toHaveCount(0);
});

test('op een staging-installatie staat een geel TEST-label in de navbar, voor Dossiers', async ({ page }) => {
  await start(page);
  await alsOmgeving(page, 'test');
  await page.goto('/dossiers');
  const label = page.locator('.qa-omgeving-label');
  await expect(label).toHaveText('TEST');
  await expect(label).toHaveClass(/text-bg-warning/);
  const labelVak = await label.boundingBox();
  const dossiersVak = await page.locator('.qa-nav-dossiers').boundingBox();
  expect(labelVak!.x).toBeLessThan(dossiersVak!.x);
});

test('op een staging-installatie staat boven de navbar een banner dat dit een testomgeving is zonder echte gegevens', async ({ page }) => {
  await start(page);
  await alsOmgeving(page, 'test');
  await page.goto('/dossiers');
  const banner = page.locator('.qa-staging-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('geen echte gegevens');
  const bannerVak = await banner.boundingBox();
  const navbarVak = await page.locator('.qa-navbar').boundingBox();
  expect(bannerVak!.y + bannerVak!.height).toBeLessThanOrEqual(navbarVak!.y);
});

test('in development staat er een groen DEV-label in de navbar, en geen staging-banner', async ({ page }) => {
  await start(page);
  await alsOmgeving(page, 'dev');
  await page.goto('/dossiers');
  const label = page.locator('.qa-omgeving-label');
  await expect(label).toHaveText('DEV');
  await expect(label).toHaveClass(/text-bg-success/);
  await expect(page.locator('.qa-staging-banner')).toHaveCount(0);
});

test('het label en de staging-banner staan ook op de inlogpagina', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await alsOmgeving(page, 'test');
  await page.goto('/inloggen');
  await expect(page.locator('.qa-navbar-uitgelogd .qa-omgeving-label')).toHaveText('TEST');
  await expect(page.locator('.qa-staging-banner')).toBeVisible();
});

test('op de testomgeving maakt /proberen een proefomgeving aan met naam en e-mailadres en logt in met de code', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await alsOmgeving(page, 'test');
  const verzonden: Record<string, unknown>[] = [];
  for (const pad of ['**/api/proberen', '**/api/auth/code']) {
    await page.route(pad, (route) => (verzonden.push(route.request().postDataJSON()), route.fulfill({ json: { ok: true } })));
  }
  await page.goto('/proberen');
  await page.locator('.qa-proberen-naam').fill('Pim Proef');
  await page.locator('.qa-proberen-email').fill('pim@example.org');
  await page.locator('.qa-proberen-maak').click();
  await expect(page.locator('.qa-proberen-verstuurd')).toContainText('pim@example.org');
  await page.locator('.qa-proberen-code').fill('123456');
  await page.locator('.qa-proberen-inloggen').click();
  await page.waitForURL((url) => url.pathname !== '/proberen');
  expect(verzonden).toEqual([{ naam: 'Pim Proef', email: 'pim@example.org' }, { email: 'pim@example.org', code: '123456' }]);
});

test('op de live site toont /proberen geen aanmeldformulier', async ({ page }) => {
  await start(page);
  await page.context().clearCookies();
  await page.goto('/proberen');
  await expect(page.locator('.qa-proberen-niet')).toBeVisible();
  await expect(page.locator('.qa-proberen-form')).toHaveCount(0);
});

test('in een proefomgeving staat bovenaan het overzicht een blauwe banner dat je mag rondkijken en dat hij na 90 dagen zonder gebruik verdwijnt', async ({ page }) => {
  await start(page);
  await page.route('**/api/overzicht', async (route) => route.fulfill({ json: { ...(await (await route.fetch()).json()), proefomgeving: true } }));
  await page.goto('/');
  const banner = page.locator('.qa-proefomgeving');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveClass(/alert-info/);
  await expect(banner).toContainText('proefomgeving');
  await expect(banner).toContainText('90 dagen');
  const bannerVak = await banner.boundingBox();
  const tellingenVak = await page.locator('.qa-tellingen').boundingBox();
  expect(bannerVak!.y).toBeLessThan(tellingenVak!.y);
});

test('buiten een proefomgeving staat er geen proefomgeving-banner op het overzicht', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await expect(page.locator('.qa-tellingen')).toBeVisible();
  await expect(page.locator('.qa-proefomgeving')).toHaveCount(0);
});
