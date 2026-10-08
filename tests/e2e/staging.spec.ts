// The DEV or TEST label in the navbar. The e2e server is neither, so the label tests set omgeving in /api/auth/me's answer.
import { type Page, expect, test } from '@playwright/test';
import type { Omgeving } from '../../src/shared/types.ts';
import { start } from './hulp.ts';

async function alsOmgeving(page: Page, omgeving: Omgeving): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), omgeving } });
  });
}

test('op de live site staat er geen label in de navbar', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await expect(page.locator('.qa-nav-dossiers')).toBeVisible();
  await expect(page.locator('.qa-omgeving-label')).toHaveCount(0);
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

test('in development staat er een groen DEV-label in de navbar', async ({ page }) => {
  await start(page);
  await alsOmgeving(page, 'dev');
  await page.goto('/dossiers');
  const label = page.locator('.qa-omgeving-label');
  await expect(label).toHaveText('DEV');
  await expect(label).toHaveClass(/text-bg-success/);
});
