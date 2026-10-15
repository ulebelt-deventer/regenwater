// The Bezoek sub-page: the Dak table with each dakdeel's verdeling over the regenpijpen, then one block per regenpijp.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { nieuwDossier, opslagKlaar, start, zet } from './hulp.ts';

const vak = (l: Locator) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, midden: r.top + r.height / 2 }; });

async function tweeRegenpijpen(page: Page): Promise<number> {
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
  return id;
}

test('elke regenpijp is een omkaderd blok met Pijp, Voert af van en Waterberging, keuzelijsten voor Soort, Diameter, Regenton en Afkoppelen, een Waar van 2 regels, en de foto’s onder Waar en Hoe', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  const blokken = page.locator('.qa-regenpijpen .qa-regenpijp');
  await expect(blokken.locator('.qa-regenpijp-kop')).toHaveText(['A', 'B']);
  const a = blokken.first();
  await expect(a).toHaveClass(/\bborder\b/);
  await expect(a.locator('.qa-bronnen')).toHaveText('D1 (50%)');
  await expect(a.locator('.qa-waterberging')).toContainText('240 liter');

  await a.locator('.qa-veld-regenpijp-soort select.qa-invoer').selectOption('zink');
  await a.locator('.qa-veld-regenpijp-diameter select.qa-invoer').selectOption('anders');
  await expect(a.locator('.qa-veld-regenpijp-diameter .qa-anders')).toBeFocused();
  await a.locator('.qa-veld-regenpijp-regenton select.qa-invoer').selectOption('gewenst');
  await expect(a.locator('.qa-veld-regenpijp-ondergrond .qa-invoer')).toBeVisible();
  await a.locator('.qa-veld-regenpijp-afkoppelen select.qa-invoer').selectOption('twijfel');
  await expect(a.locator('.qa-veld-regenpijp-afkoppelen .form-text')).toHaveCount(0);
  await expect(a.locator('.qa-veld-regenpijp-waar textarea')).toHaveAttribute('rows', '2');

  for (const v of ['waar', 'hoe']) {
    const veld = a.locator(`.qa-veld-regenpijp-${v}`);
    await expect(veld.locator('.form-label').first()).toHaveText(v === 'waar' ? 'Waar moet het water naartoe?' : 'Hoe moet het water daarnaartoe komen?');
    expect((await vak(veld.locator('.qa-fotoslot'))).top).toBeGreaterThanOrEqual((await vak(veld.locator('.qa-invoer'))).bottom);
  }

  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  const data = ((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data;
  expect([data['regenpijp.r1.soort'], data['regenpijp.r1.diameter'], data['regenpijp.r1.regenton'], data['regenpijp.r1.afkoppelen']]).toEqual(['zink', 'anders', 'gewenst', 'twijfel']);
});

test('Hoe moet het water komen is een keuzemenu met vinkjes; Anders maakt plaats voor een invulveld met de focus, en dat leeg verlaten zet het vinkje terug', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  const veld = page.locator('.qa-regenpijp').first().locator('.qa-veld-regenpijp-hoe');
  const knop = veld.locator('.qa-invoer');
  await expect(knop).toHaveText('- kies -');
  await knop.click();
  await veld.locator('.qa-optie-holie_molie').check();
  await veld.locator('.qa-optie-ondergronds').check();
  await expect(knop).toHaveText('Holie Molie, Ondergronds');

  // click, not check: ticking it swaps the checkbox for the write-in, so check() can't confirm it ticked.
  await veld.locator('.qa-optie-anders').click();
  const anders = veld.locator('.qa-anders');
  await expect(anders).toBeFocused();
  await expect(veld.locator('.qa-optie-anders')).toHaveCount(0);
  await anders.fill('Grindkoffer');
  await expect(knop).toHaveText('Holie Molie, Ondergronds, Grindkoffer');
  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  const data = ((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data;
  expect([data['regenpijp.r1.hoe'], data['regenpijp.r1.hoe_anders']]).toEqual([['holie_molie', 'ondergronds', 'anders'], 'Grindkoffer']);

  await anders.fill('');
  await anders.blur();
  await expect(veld.locator('.qa-anders')).toHaveCount(0);
  await expect(veld.locator('.qa-optie-anders')).not.toBeChecked();
  await expect(knop).toHaveText('Holie Molie, Ondergronds');
});

test('de Dak-tabel is maar zo breed als zijn inhoud, niet de hele breedte', async ({ page }) => {
  await tweeRegenpijpen(page);
  const tabel = page.locator('.qa-daken-tabel');
  const [tabelBreedte, ouderBreedte] = await tabel.evaluate((el) => [el.getBoundingClientRect().width, el.parentElement!.clientWidth]);
  expect(tabelBreedte).toBeLessThan(ouderBreedte / 2);
});

test('op een telefoon is elk dakdeel een kaartje met labels en passen de regenpijpblokken zonder zijwaarts scrollen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await tweeRegenpijpen(page);
  const tabel = page.locator('.qa-daken-tabel');
  await expect(tabel.locator('thead')).toBeHidden();
  for (const el of [tabel, page.locator('.qa-regenpijpen')]) {
    const breedte = await el.evaluate((x) => [x.scrollWidth, x.parentElement!.clientWidth]);
    expect(breedte[0]).toBeLessThanOrEqual(breedte[1]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.qa-verdeling-tekst')).toHaveText('A 50% · B 50%');
  await expect(page.locator('.qa-regenpijp .qa-waterberging').first()).toContainText('240 liter');
});

test('in de verdeling staat elk vinkje op één lijn met zijn regenpijp, ook met een % of een rode notitie ernaast', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[10, 5]] },
      { id: 'r3', type: 'regenpijp', p: [[200, 5]] },
    ],
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  await page.locator('.qa-verdeling-knop').click();
  const pijpen = page.locator('.qa-verdeling-pijp');
  await expect(pijpen.nth(0).locator('.qa-verdeling-pct')).toBeVisible();
  await expect(pijpen.nth(2).locator('.qa-verdeling-geen-dak')).toBeVisible();
  for (const i of [0, 2]) {
    const vinkje = await vak(pijpen.nth(i).locator('.qa-verdeling-aan'));
    const label = await vak(pijpen.nth(i).locator('.qa-verdeling-label'));
    expect(Math.abs(vinkje.midden - label.midden)).toBeLessThan(2);
  }
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
  const liters = page.locator('.qa-regenpijp .qa-waterberging');
  await expect(knop).toHaveText('A');
  await expect(liters.nth(1)).toContainText('200 liter');

  await knop.click();
  await expect(d1.locator('.qa-verdeling-auto')).toBeVisible();
  const pijpen = d1.locator('.qa-verdeling-pijp');
  await pijpen.nth(1).locator('.qa-verdeling-aan').check();
  await expect(d1.locator('.qa-verdeling-auto')).toHaveCount(0);
  await expect(pijpen.nth(0).locator('.qa-verdeling-pct')).toHaveValue('99');
  await expect(pijpen.nth(1).locator('.qa-verdeling-pct')).toHaveValue('1');
  await pijpen.nth(0).locator('.qa-verdeling-pct').fill('75');
  await pijpen.nth(0).locator('.qa-verdeling-pct').blur();
  await expect(pijpen.nth(1).locator('.qa-verdeling-pct')).toHaveValue('25');
  await expect(knop).toHaveText('A 75% · B 25%');
  await expect(knop.locator('strong')).toHaveText(['A', 'B']);
  const x = (i: number) => pijpen.nth(i).locator('.qa-verdeling-pct').evaluate((el) => el.getBoundingClientRect().left);
  expect(await x(0)).toBe(await x(1));
  await expect(liters.nth(1)).toContainText('25% × 40 m² + 10 m² = 20 m²');
  await expect(liters.nth(1)).toContainText('400 liter');
  await expect(page.locator('#veld-regenpijp\\.r2\\.bronnen .qa-bronnen')).toHaveText('D1 (25%), D2');
  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  expect(((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data['dak.d1.verdeling']).toEqual({ r1: 75, r2: 25 });

  await expect(d1.locator('.qa-verdeling-automatisch .bi-arrow-repeat')).toBeVisible();
  await d1.locator('.qa-verdeling-automatisch').click();
  await expect(knop).toHaveText('A');
  await expect(d1.locator('.qa-verdeling-auto')).toBeVisible();
  await expect(liters.nth(1)).toContainText('200 liter');
});

test('een regenpijp die van geen enkel dakdeel afvoert krijgt in de verdeling een rode notitie', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'd2', type: 'dak', p: [[100, 0], [110, 0], [110, 10], [100, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[105, 5]] },
    ],
    'dak.d2.verdeling': {},
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  const d1 = page.locator('#veld-dak\\.d1\\.verdeling');
  await d1.locator('.qa-verdeling-knop').click();
  const pijpen = d1.locator('.qa-verdeling-pijp');
  await expect(pijpen.nth(0).locator('.qa-verdeling-geen-dak')).toHaveCount(0);
  await expect(pijpen.nth(1).locator('.qa-verdeling-geen-dak')).toHaveText('Heeft geen dakdeel');

  await pijpen.nth(1).locator('.qa-verdeling-aan').check();
  await expect(pijpen.nth(1).locator('.qa-verdeling-geen-dak')).toHaveCount(0);
});
