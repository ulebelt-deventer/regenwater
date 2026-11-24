// The DEV or TEST label in the navbar and the staging banner. The e2e server is neither, so the label tests fake /api/omgeving's answer.
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
