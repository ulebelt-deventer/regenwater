// The TEST label in the navbar on a staging install. The e2e server isn't staging, so the second test flips the flag in /api/auth/me's answer.
import { expect, test } from '@playwright/test';
import { start } from './hulp.ts';

test('zonder STAGING staat er geen TEST-label in de navbar', async ({ page }) => {
  await start(page);
  await page.goto('/dossiers');
  await expect(page.locator('.qa-nav-dossiers')).toBeVisible();
  await expect(page.locator('.qa-staging-label')).toHaveCount(0);
});

test('op een staging-installatie staat TEST in de navbar, voor Dossiers', async ({ page }) => {
  await start(page);
  await page.route('**/api/auth/me', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), staging: true } });
  });
  await page.goto('/dossiers');
  const label = page.locator('.qa-staging-label');
  await expect(label).toHaveText('TEST');
  await expect(label).toHaveClass(/text-bg-warning/);
  const labelVak = await label.boundingBox();
  const dossiersVak = await page.locator('.qa-nav-dossiers').boundingBox();
  expect(labelVak!.x).toBeLessThan(dossiersVak!.x);
});
