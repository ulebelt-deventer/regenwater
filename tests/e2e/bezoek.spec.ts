// The Bezoek sub-page: each regenpijp is its own accordion whose header sticks to the top while you scroll through it.
import { type Page, expect, test } from '@playwright/test';
import { nieuwDossier, opslagKlaar, start, zet } from './hulp.ts';

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

test('op een telefoon is elk dakdeel en elke regenpijp een kaartje met labels, zonder zijwaarts scrollen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[10, 5]] },
    ],
    'dak.d1.m2': 24,
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  for (const tabel of [page.locator('.qa-daken-tabel'), page.locator('.qa-regenpijpen-tabel')]) {
    await expect(tabel.locator('thead')).toBeHidden();
    const breedte = await tabel.evaluate((el) => [el.scrollWidth, el.parentElement!.clientWidth]);
    expect(breedte[0]).toBeLessThanOrEqual(breedte[1]);
  }
  await expect(page.locator('.qa-verdeling-tekst')).toHaveText('A 50% · B 50%');
  const wb = page.locator('.qa-regenpijp-rij .qa-waterberging').first();
  await expect(wb).toContainText('240 liter');
  expect(await wb.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Waterberging**: "');
});

test('een dakdeel over twee regenpijpen verdelen past de andere regenpijp en de liters aan, en Terug naar automatisch herstelt het', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'd2', type: 'dak', p: [[100, 0], [110, 0], [110, 10], [100, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[105, 5]] },
    ],
    'dak.d1.m2': 40,
    'dak.d2.m2': 10,
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  const d1 = page.locator('#veld-dak\\.d1\\.verdeling');
  const knop = d1.locator('.qa-verdeling-knop');
  const liters = page.locator('.qa-regenpijp-rij .qa-waterberging');
  await expect(knop).toHaveText('A(automatisch)');
  await expect(liters.nth(1)).toContainText('200 liter');

  await knop.click();
  const pijpen = d1.locator('.qa-verdeling-pijp');
  await pijpen.nth(1).locator('.qa-verdeling-aan').check();
  await expect(pijpen.nth(0).locator('.qa-verdeling-pct')).toHaveValue('99');
  await expect(pijpen.nth(1).locator('.qa-verdeling-pct')).toHaveValue('1');
  await pijpen.nth(0).locator('.qa-verdeling-pct').fill('75');
  await pijpen.nth(0).locator('.qa-verdeling-pct').blur();
  await expect(pijpen.nth(1).locator('.qa-verdeling-pct')).toHaveValue('25');
  await expect(knop).toHaveText('A 75% · B 25%');
  await expect(liters.nth(1)).toContainText('25% × 40 m² + 10 m² = 20 m²');
  await expect(liters.nth(1)).toContainText('400 liter');
  await expect(page.locator('#veld-regenpijp\\.r2\\.bronnen .qa-bronnen')).toHaveText('D1 (25%), D2');
  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  expect(((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data['dak.d1.verdeling']).toEqual({ r1: 75, r2: 25 });

  await d1.locator('.qa-verdeling-automatisch').click();
  await expect(knop).toHaveText('A(automatisch)');
  await expect(liters.nth(1)).toContainText('200 liter');
});
