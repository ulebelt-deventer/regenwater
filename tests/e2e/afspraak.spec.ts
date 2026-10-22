// The Bezoek-afspraak's time: hour and quarter-hour selects in 24-hour notation.
import { expect, test } from '@playwright/test';
import { naarDossier, nieuwDossier, opslagKlaar, start, subsidieMail, veld, wijsToe, zet } from './hulp.ts';

test('de afspraaktijd kies je als uur 06 tot 20 en kwartieren; alleen een uur bewaart op het hele uur', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  const v = veld(page, 'afspraak');
  const uren = Array.from({ length: 15 }, (_, i) => String(i + 6).padStart(2, '0'));
  await expect(v.locator('.qa-uur option:not([disabled])')).toHaveText(uren);
  await expect(v.locator('.qa-minuut option:not([disabled])')).toHaveText(['00', '15', '30', '45']);

  await v.locator('.qa-datum').fill('2026-03-02');
  await expect(v.locator('.qa-tijd-ontbreekt')).toBeVisible();
  await v.locator('.qa-uur').selectOption('14');
  await opslagKlaar(page);
  await expect(v.locator('.qa-tijd-ontbreekt')).toHaveCount(0);
  await page.reload();
  await expect(v.locator('.qa-uur')).toHaveValue('14');
  await expect(v.locator('.qa-minuut')).toHaveValue('00');

  await v.locator('.qa-minuut').selectOption('45');
  await opslagKlaar(page);
  await page.reload();
  await expect(v.locator('.qa-datum')).toHaveValue('2026-03-02');
  await expect(v.locator('.qa-uur')).toHaveValue('14');
  await expect(v.locator('.qa-minuut')).toHaveValue('45');
});

test('een eerder bewaarde tijd buiten de kwartieren en uren blijft zichtbaar', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await zet(page, id, { afspraak: '2026-03-02T21:10' });
  await page.reload();
  const v = veld(page, 'afspraak');
  await expect(v.locator('.qa-uur')).toHaveValue('21');
  await expect(v.locator('.qa-minuut')).toHaveValue('10');
});
