// The Bezoek sub-page: each regenpijp is its own accordion whose header sticks to the top while you scroll through it.
import { type Page, expect, test } from '@playwright/test';
import { nieuwDossier, start, zet } from './hulp.ts';

async function drieRegenpijpen(page: Page): Promise<void> {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
      { id: 'r2', type: 'regenpijp', p: [[2, 2]] },
      { id: 'r3', type: 'regenpijp', p: [[3, 3]] },
    ],
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(page.locator('.qa-regenpijp-kop')).toHaveText(['Regenpijp A', 'Regenpijp B', 'Regenpijp C']);
}

test('elke regenpijp is een eigen accordeon met een lijn onder de kop, en tikken op de kop klapt hem in en uit', async ({ page }) => {
  await drieRegenpijpen(page);
  const b = page.locator('.qa-regenpijp').nth(1);
  const kop = b.locator('.qa-regenpijp-kop');
  await expect(b.locator('xpath=..')).toHaveClass(/\baccordion\b/);
  await expect(b).toHaveClass(/accordion-item/);
  expect(await kop.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/0px -1px 0px 0px inset/);
  const veld = b.locator('.qa-veld-regenpijp-waar .qa-invoer');
  await expect(veld).toBeVisible();

  await kop.click();
  await expect(veld).toBeHidden();
  await expect(kop).toHaveClass(/collapsed/);
  await expect(page.locator('.qa-regenpijp').nth(2).locator('.qa-veld-regenpijp-waar .qa-invoer')).toBeVisible();

  await kop.click();
  await expect(veld).toBeVisible();
  await expect(kop).not.toHaveClass(/collapsed/);
});

test('midden in Regenpijp C staat zijn kop bovenaan in beeld, en tikken erop schuift in ongeveer 250 ms terug naar het begin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await drieRegenpijpen(page);
  const c = page.locator('.qa-regenpijp').nth(2);
  const begin = await c.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), begin + 300);

  const bovenaan = () => page.evaluate(() => document.elementFromPoint(195, 10)?.closest('.qa-regenpijp-kop')?.textContent ?? null);
  await expect.poll(bovenaan).toBe('Regenpijp C');

  const rit = await c.locator('.qa-regenpijp-kop').evaluate(async (kop) => {
    const van = window.scrollY;
    const posities: number[] = [];
    const t0 = performance.now();
    let aangekomen = 0;
    (kop as HTMLElement).click();
    while (performance.now() - t0 < 700) {
      await new Promise(requestAnimationFrame);
      posities.push(window.scrollY);
      if (!aangekomen && posities.at(-1) !== van && posities.at(-1) === posities.at(-2)) aangekomen = performance.now() - t0;
    }
    return { posities, aangekomen };
  });
  expect(rit.posities.at(-1)).toBeCloseTo(begin, -1);
  expect(new Set(rit.posities).size).toBeGreaterThan(5);
  expect(rit.aangekomen).toBeGreaterThan(200);
  expect(rit.aangekomen).toBeLessThan(450);
  await expect(c).not.toHaveAttribute('open');
  await expect(c.locator('.qa-veld-regenpijp-waar .qa-invoer')).toBeHidden();
  await expect(c.locator('.qa-regenpijp-kop')).toHaveClass(/collapsed/);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(begin, -1);
});

test('op een telefoon is elk dakdeel een kaartje met labels, zonder zijwaarts scrollen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
      { id: 'r2', type: 'regenpijp', p: [[2, 2]] },
    ],
    'dak.d1.m2': 24,
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  const tabel = page.locator('.qa-daken-tabel');
  await expect(tabel.locator('thead')).toBeHidden();
  await expect(tabel.locator('.qa-waterberging')).toContainText('240 liter');
  const label = await tabel.locator('.qa-waterberging').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(label).toBe('"Waterberging per regenpijp**: "');
  const breedte = await tabel.evaluate((el) => [el.scrollWidth, el.parentElement!.clientWidth]);
  expect(breedte[0]).toBeLessThanOrEqual(breedte[1]);
});
