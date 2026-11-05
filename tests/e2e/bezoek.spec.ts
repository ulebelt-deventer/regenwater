// The Bezoek sub-page: the Dak table with each dakdeel's verdeling over the regenpijpen, then one block per regenpijp.
import { type Locator, type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { nieuwDossier, opslagKlaar, planTekst, start, veld, zet } from './hulp.ts';

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

const rechthoek = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

// Where an element's text starts, past any padding.
const tekstLinks = (l: Locator) => l.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().left; });
const kaartPng = async () => sharp({ create: { width: 400, height: 300, channels: 3, background: '#e8e8e8' } }).png().toBuffer();

test('de kaartuitsnede van een regenpijp steekt ~11px buiten de linkerbovenhoek van zijn blok uit, de niet-vette kop begint rechts ervan, en de velden beginnen links in het blok, eronder', async ({ page }) => {
  await tweeRegenpijpen(page);
  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: await kaartPng() });
  const blok = page.locator('.qa-regenpijp').first();
  const uitsnede = blok.locator('.qa-bronnen-uitsnede');
  await expect(uitsnede).toBeVisible();
  const kop = blok.locator('.qa-regenpijp-titel');
  expect(Number(await kop.evaluate((el) => getComputedStyle(el).fontWeight))).toBeLessThan(600);
  for (const breedte of [320, 390, 800, 1280]) {
    await page.setViewportSize({ width: breedte, height: 800 });
    const [b, u, label, afkoppelen, waar] = await Promise.all([blok, uitsnede, blok.locator('.qa-veld-regenpijp-bronnen .form-label'), blok.locator('.qa-veld-regenpijp-afkoppelen'), blok.locator('.qa-veld-regenpijp-waar')].map(rechthoek));
    // The fields sit .5rem inside the 1px border.
    const binnenLinks = b.left + 1 + 8;
    expect(u.width).toBeGreaterThan(40);
    for (const uitsteek of [b.left - u.left, b.top - u.top]) expect(uitsteek).toBeCloseTo(11, 0);
    expect(await tekstLinks(kop)).toBeGreaterThan(u.right);
    expect(label.left).toBeCloseTo(binnenLinks, 0);
    expect(label.top).toBeGreaterThanOrEqual(u.bottom - 0.5);
    // The row's vertical gutter stays: Waar starts a row of its own, .5rem under the last short cell.
    expect(waar.top - afkoppelen.bottom).toBeCloseTo(8, 0);
  }
});

test('tikken op de kaartuitsnede van een regenpijp scrolt omhoog naar de kaart en klapt het blok niet dicht', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await tweeRegenpijpen(page);
  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: await kaartPng() });
  const blok = page.locator('.qa-regenpijp').last();
  const uitsnede = blok.locator('.qa-bronnen-uitsnede');
  await expect(uitsnede).toBeVisible();
  await uitsnede.scrollIntoViewIfNeeded();
  const kaartTop = () => page.locator('#veld-kaart').evaluate((el) => el.getBoundingClientRect().top);
  expect(await kaartTop()).toBeLessThan(0);
  await uitsnede.click();
  await expect.poll(kaartTop, { timeout: 2000 }).toBeCloseTo(16, 0);
  await expect(blok).toHaveAttribute('open', '');
  await opslagKlaar(page);
});

test('een regenpijpblok is open; tikken op de kop klapt het dicht tot alleen de kop met kaartuitsnede, en weer open; open is de kop lichtblauw met een lijn eronder en een caret-up, dicht wit met een caret-down', async ({ page }) => {
  await tweeRegenpijpen(page);
  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: await kaartPng() });
  const blok = page.locator('.qa-regenpijp').first();
  const kop = blok.locator('.qa-regenpijp-kop');
  const caret = kop.locator('.qa-regenpijp-caret');
  const soort = blok.locator('.qa-veld-regenpijp-soort');
  const stijl = () => kop.evaluate((el) => { const s = getComputedStyle(el); return { lijn: s.borderBottomWidth, achtergrond: s.backgroundColor }; });
  const isLichtblauw = (kleur: string) => {
    const [r, , b] = kleur.match(/\d+/g)!.map(Number);
    return kleur.startsWith('rgb(') && b > r && b > 230 && r > 200;
  };
  await expect(soort).toBeVisible();
  let s = await stijl();
  expect(s.lijn).toBe('1px');
  expect(isLichtblauw(s.achtergrond)).toBe(true);
  await expect(caret).toHaveClass(/\bbi-caret-up\b/);
  await blok.locator('.qa-regenpijp-titel').click();
  await expect(soort).toBeHidden();
  await expect(blok).not.toHaveAttribute('open');
  await expect(blok.locator('.qa-bronnen-uitsnede')).toBeVisible();
  s = await stijl();
  expect(s.lijn).toBe('0px');
  // Transparent over the white page.
  expect(s.achtergrond).toBe('rgba(0, 0, 0, 0)');
  await expect(caret).toHaveClass(/\bbi-caret-down\b/);
  await blok.locator('.qa-regenpijp-titel').click();
  await expect(soort).toBeVisible();
  await expect(blok).toHaveAttribute('open', '');
  s = await stijl();
  expect(s.lijn).toBe('1px');
  expect(isLichtblauw(s.achtergrond)).toBe(true);
  await expect(caret).toHaveClass(/\bbi-caret-up\b/);
  await opslagKlaar(page);
});

test('dicht- en openklappen van een regenpijpblok schuift de inhoud in 200 ms lineair dicht en open', async ({ page }) => {
  await tweeRegenpijpen(page);
  const blok = page.locator('.qa-regenpijp').first();
  const inhoud = blok.locator('.qa-regenpijp-inhoud');
  await expect(inhoud).toBeVisible();
  const volle = (await rechthoek(inhoud)).height;
  expect(volle).toBeGreaterThan(100);
  // Read the running slide right after the click, in the same task.
  const schuif = (klikOp: Locator) =>
    klikOp.evaluate((el: HTMLElement) => {
      el.click();
      const details = el.closest('details')!;
      const a = details.querySelector('.qa-regenpijp-inhoud')!.getAnimations()[0];
      const t = a.effect!.getTiming();
      return { duur: t.duration, easing: t.easing, hoogtes: (a.effect as KeyframeEffect).getKeyframes().map((k) => parseFloat(String(k.height))), open: details.open };
    });
  const titel = blok.locator('.qa-regenpijp-titel');
  const dicht = await schuif(titel);
  // Still open while it slides shut.
  expect(dicht).toMatchObject({ duur: 200, easing: 'linear', open: true });
  expect(dicht.hoogtes[0]).toBeCloseTo(volle, 0);
  expect(dicht.hoogtes[1]).toBe(0);
  await expect(blok).not.toHaveAttribute('open');
  const open = await schuif(titel);
  expect(open).toMatchObject({ duur: 200, easing: 'linear' });
  expect(open.hoogtes[0]).toBe(0);
  expect(open.hoogtes[1]).toBeCloseTo(volle, 0);
  await expect(blok.locator('.qa-veld-regenpijp-soort')).toBeVisible();
  await expect.poll(async () => (await rechthoek(inhoud)).height).toBeCloseTo(volle, 0);
});

test('een link naar een ontbrekend veld in een dichtgeklapt regenpijpblok klapt het open en scrolt ernaartoe', async ({ page }) => {
  await tweeRegenpijpen(page);
  const blok = page.locator('.qa-regenpijp').first();
  await blok.locator('.qa-regenpijp-titel').click();
  await expect(blok.locator('.qa-veld-regenpijp-soort')).toBeHidden();
  await page.locator('.qa-ontbrekend-link').filter({ hasText: 'Regenpijp A: Soort' }).click();
  await expect(blok).toHaveAttribute('open', '');
  await expect(blok.locator('.qa-veld-regenpijp-soort')).toBeVisible();
  await expect(blok.locator('.qa-veld-regenpijp-soort')).toBeInViewport();
});

test('de kaartuitsnede staat er ook bij een regenpijp die van geen dakdeel afvoert, en ontbreekt alleen zonder kaart', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, { kaart_annotaties: [{ id: 'r1', type: 'regenpijp', p: [[200, 150]] }] });
  await page.goto(`/dossiers/${id}/bezoek`);
  const blok = page.locator('.qa-regenpijp');
  await expect(blok.locator('.qa-geen-bron')).toBeVisible();
  await expect(blok.locator('.qa-bronnen-uitsnede')).toHaveCount(0);
  const kop = blok.locator('.qa-regenpijp-titel');
  expect((await tekstLinks(kop)) - (await rechthoek(blok)).left).toBeLessThan(12);

  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: await kaartPng() });
  await expect(blok.locator('.qa-bronnen-uitsnede')).toBeVisible();
  const u = await rechthoek(blok.locator('.qa-bronnen-uitsnede'));
  expect(u.width).toBeGreaterThan(40);
  expect(await tekstLinks(kop)).toBeGreaterThan(u.right);
  await opslagKlaar(page);
});

test('de regenpijpblokken hebben een schaduw en 14px ertussen, en de voetnoot staat 8px onder het laatste blok', async ({ page }) => {
  await tweeRegenpijpen(page);
  const [a, b, voetnoot] = await Promise.all([page.locator('.qa-regenpijp').nth(0), page.locator('.qa-regenpijp').nth(1), page.locator('.qa-regenpijpen > .small.text-muted')].map(rechthoek));
  expect(b.top - a.bottom).toBeCloseTo(14, 0);
  expect(voetnoot.top - b.bottom).toBeCloseTo(8, 0);
  expect(await page.locator('.qa-regenpijp').first().evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});

test('de berekening onder Waterberging is 80% van de gewone tekstgrootte', async ({ page }) => {
  await tweeRegenpijpen(page);
  const berging = page.locator('.qa-waterberging').first();
  await expect(berging).toContainText('liter');
  const [gewoon, uitleg] = await Promise.all([berging, berging.locator('.text-muted')].map((l) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))));
  expect(uitleg).toBeCloseTo(gewoon * 0.8, 1);
});

test('Tuin- en Steenrijen hebben lijnen erboven en eronder en smalle kolommen; de foto’s staan rechts in de rij, behalve twee of meer op een telefoon: die krijgen een eigen regel', async ({ page }) => {
  for (const breedte of [320, 576, 1280]) {
    await page.setViewportSize({ width: breedte, height: 800 });
    await start(page);
    const id = await nieuwDossier(page, { huurKoop: 'koop' });
    await zet(page, id, {
      kaart_annotaties: [
        { id: 't1', type: 'tuin', p: [[0, 0], [10, 0], [10, 10]] },
        { id: 's1', type: 'steen', p: [[20, 0], [30, 0], [30, 10]] },
      ],
    });
    await page.goto(`/dossiers/${id}/bezoek`);
    for (const soort of ['tuin', 'steen']) {
      const rij = page.locator(`.qa-${soort}-rij`);
      await expect(rij).toBeVisible();
      for (const [el, kant] of [[rij.locator('..'), 'borderTopWidth'], [rij, 'borderBottomWidth']] as const) expect(await el.evaluate((e, k) => getComputedStyle(e)[k], kant)).toBe('1px');
      const slot = rij.locator('.qa-fotoslot');
      const invoer = rij.locator('.qa-invoer');
      await rij.locator('input.qa-foto-invoer').setInputFiles({ name: 'een.png', mimeType: 'image/png', buffer: await kaartPng() });
      await expect(slot.locator('.qa-foto')).toHaveCount(1);
      const [r, i1, s1] = await Promise.all([rij, invoer, slot].map(rechthoek));
      expect(s1.width).toBeGreaterThan(0);
      expect(s1.left).toBeGreaterThan(i1.right);
      expect(s1.top).toBeLessThan(i1.bottom);
      // Narrow columns: label (2rem), m² (7rem) and two 1rem gaps put the photo 11rem from the row's left edge, at any width.
      expect(s1.left - r.left).toBeCloseTo(11 * 16, 0);

      await rij.locator('.qa-foto-toevoegen').click();
      const [kiezer] = await Promise.all([page.waitForEvent('filechooser'), rij.locator('.qa-foto-kiezen').click()]);
      await kiezer.setFiles({ name: 'twee.png', mimeType: 'image/png', buffer: await kaartPng() });
      await page.locator('.qa-bevestig .qa-toevoegen').click();
      await expect(slot.locator('.qa-foto')).toHaveCount(2);
      const [i2, f1, f2] = await Promise.all([invoer, slot.locator('.qa-foto').nth(0), slot.locator('.qa-foto').nth(1)].map(rechthoek));
      if (breedte < 576) expect(f1.top).toBeGreaterThanOrEqual(i2.bottom);
      else {
        expect(f1.left).toBeCloseTo(s1.left, 0);
        expect(f1.top).toBeLessThan(i2.bottom);
      }
      expect(f2.top).toBe(f1.top);
    }
    await opslagKlaar(page);
  }
});

test('Dak en Regenpijpen zijn h3-koppen met 32px erboven en 16px marge eronder', async ({ page }) => {
  await tweeRegenpijpen(page);
  await expect(page.locator('.qa-daken > h3')).toHaveText('Dak');
  await expect(page.locator('.qa-regenpijpen > h3')).toHaveText('Regenpijpen');
  for (const kop of [page.locator('.qa-daken > h3'), page.locator('.qa-regenpijpen > h3')]) {
    await expect(kop).toBeVisible();
    const { boven, onder } = await kop.evaluate((el) => ({ boven: el.getBoundingClientRect().top - el.parentElement!.previousElementSibling!.getBoundingClientRect().bottom, onder: getComputedStyle(el).marginBottom }));
    expect(boven).toBeCloseTo(32, 0);
    expect(onder).toBe('16px');
  }
});

test('Voert af van houdt elk dakdeel bij zijn percentage: elk staat ongebroken op één regel', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'd2', type: 'dak', p: [[20, 0], [30, 0], [30, 10], [20, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[10, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[20, 5]] },
    ],
    'dak.d1.verdeling': { r1: 60, r2: 40 },
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  const bronnen = page.locator('#veld-regenpijp\\.r2\\.bronnen');
  await expect(bronnen.locator('.qa-bronnen')).toHaveText('D1 (40%), D2');
  await expect(bronnen.locator('.qa-bron')).toHaveText(['D1 (40%)', 'D2']);
  for (const bron of await bronnen.locator('.qa-bron').all()) expect(await bron.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
});

test('met twee of meer foto’s staat het fotovak van Waar ook vanaf md onder de invoer, die dan de hele cel vult', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await tweeRegenpijpen(page);
  const veld = page.locator('.qa-regenpijp').first().locator('.qa-veld-regenpijp-waar');
  const invoer = veld.locator('.qa-invoer').first();
  const slot = veld.locator('.qa-fotoslot');
  await veld.locator('input.qa-foto-invoer').setInputFiles({ name: 'een.png', mimeType: 'image/png', buffer: await kaartPng() });
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  const [i1, s1] = await Promise.all([invoer, slot].map(rechthoek));
  expect(s1.left).toBeGreaterThanOrEqual(i1.right);
  expect(s1.top).toBeLessThan(i1.bottom);
  await veld.locator('input.qa-foto-invoer').setInputFiles({ name: 'twee.png', mimeType: 'image/png', buffer: await kaartPng() });
  await page.locator('.qa-bevestig .qa-toevoegen').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(2);
  const [label, i2, s2] = await Promise.all([veld.locator('.form-label'), invoer, slot].map(rechthoek));
  expect(i2.width).toBeGreaterThan(0);
  expect(i2.width).toBeCloseTo(label.width, 0);
  expect(s2.top).toBeGreaterThanOrEqual(i2.bottom);
  await opslagKlaar(page);
});

test('Waar en Hoe zijn vanaf md elk een halve rij met hun foto’s rechts naast de invoer, en op een telefoon met de foto’s eronder', async ({ page }) => {
  for (const [breedte, ernaast] of [[390, false], [800, true], [1280, true]] as const) {
    await page.setViewportSize({ width: breedte, height: 800 });
    await tweeRegenpijpen(page);
    const blok = page.locator('.qa-regenpijp').first();
    const rij = await rechthoek(blok.locator('.row').first());
    for (const v of ['waar', 'hoe']) {
      const veld = blok.locator(`.qa-veld-regenpijp-${v}`);
      const [cel, invoer, fotos] = await Promise.all([veld, veld.locator('.qa-invoer').first(), veld.locator('.qa-fotoslot')].map(rechthoek));
      if (ernaast) {
        expect(cel.width / rij.width).toBeCloseTo(0.5, 1);
        expect(fotos.left).toBeGreaterThanOrEqual(invoer.right);
        expect(fotos.top).toBeLessThan(invoer.bottom);
      } else {
        expect(fotos.top).toBeGreaterThanOrEqual(invoer.bottom);
      }
    }
  }
});

test('elke regenpijp is een omkaderd blok met Pijp, Voert af van en Waterberging, keuzelijsten voor Soort, Diameter, Regenton en Afkoppelen, een Waar van 2 regels, en foto’s bij Waar en Hoe', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  const blokken = page.locator('.qa-regenpijpen .qa-regenpijp');
  await expect(blokken.locator('.qa-regenpijp-titel')).toHaveText(['Regenpijp A', 'Regenpijp B']);
  const a = blokken.first();
  await expect(a).toHaveClass(/\bborder\b/);
  await expect(a.locator('.qa-bronnen')).toHaveText('D1 (50%)');
  await expect(a.locator('.qa-waterberging')).toContainText('240 liter');

  await a.locator('.qa-veld-regenpijp-soort select.qa-invoer').selectOption('zink');
  await a.locator('.qa-veld-regenpijp-diameter select.qa-invoer').selectOption('anders');
  await expect(a.locator('.qa-veld-regenpijp-diameter .qa-anders')).toBeFocused();
  await a.locator('.qa-veld-regenpijp-regenton select.qa-invoer').selectOption('gewenst');
  await expect(a.locator('.qa-veld-regenpijp-ondergrond .qa-invoer')).toBeVisible();
  await expect(a.locator('.qa-veld-regenpijp-afkoppelen option')).toHaveText(['- kies -', 'Ja', 'Nee (blijft naar riool gaan)', 'Twijfel']);
  await a.locator('.qa-veld-regenpijp-afkoppelen select.qa-invoer').selectOption('twijfel');
  await expect(a.locator('.qa-veld-regenpijp-afkoppelen .form-text')).toHaveCount(0);
  await expect(a.locator('.qa-veld-regenpijp-waar textarea')).toHaveAttribute('rows', '2');

  for (const v of ['waar', 'hoe']) {
    const veld = a.locator(`.qa-veld-regenpijp-${v}`);
    await expect(veld.locator('.form-label').first()).toHaveText(v === 'waar' ? 'Waar moet het water naartoe?' : 'Hoe moet het water daarnaartoe komen?');
    await expect(veld.locator('.qa-fotoslot')).toBeVisible();
  }

  await opslagKlaar(page);
  const res = await page.request.get(`/api/dossiers/${id}`);
  const data = ((await res.json()) as { dossier: { data: Record<string, unknown> } }).dossier.data;
  expect([data['regenpijp.r1.soort'], data['regenpijp.r1.diameter'], data['regenpijp.r1.regenton'], data['regenpijp.r1.afkoppelen']]).toEqual(['zink', 'anders', 'gewenst', 'twijfel']);
});

test('Afkoppelen op Nee verbergt Waar en Hoe alleen bij die regenpijp en ook in de samenvatting; terug op Ja staat het antwoord er nog', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  const [a, b] = [page.locator('.qa-regenpijp').first(), page.locator('.qa-regenpijp').nth(1)];
  const waar = a.locator('.qa-veld-regenpijp-waar textarea');
  await waar.fill('De border in');
  await waar.blur();
  await expect(a.locator('.qa-veld-regenpijp-hoe')).toBeVisible();

  await a.locator('.qa-veld-regenpijp-afkoppelen select.qa-invoer').selectOption('nee');
  await expect(a.locator('.qa-veld-regenpijp-waar')).toHaveCount(0);
  await expect(a.locator('.qa-veld-regenpijp-hoe')).toHaveCount(0);
  await expect(b.locator('.qa-veld-regenpijp-waar')).toBeVisible();
  await expect(b.locator('.qa-veld-regenpijp-hoe')).toBeVisible();
  await opslagKlaar(page);

  await page.goto(`/dossiers/${id}`);
  const samenvatting = page.locator('.qa-sectie-bezoek .qa-sv-regenpijp').first();
  await expect(samenvatting).toContainText('Afkoppelen: Nee');
  await expect(samenvatting).not.toContainText('De border in');

  await page.goto(`/dossiers/${id}/bezoek`);
  await a.locator('.qa-veld-regenpijp-afkoppelen select.qa-invoer').selectOption('ja');
  await expect(waar).toHaveValue('De border in');
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

test('de cellen van de regenpijpblokken staan in kolommen die van blok tot blok en van rij tot rij gelijk lopen, en de keuzelijsten en het Hoe-menu vullen hun kolom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const id = await tweeRegenpijpen(page);
  await zet(page, id, { 'regenpijp.r1.regenton': 'gewenst' });
  await page.reload();
  const [a, b] = [page.locator('.qa-regenpijp').nth(0), page.locator('.qa-regenpijp').nth(1)];
  const links = (blok: Locator, v: string) => blok.locator(`.qa-veld-regenpijp-${v}`).evaluate((el) => el.getBoundingClientRect().left);
  for (const v of ['bronnen', 'soort', 'diameter', 'regenton', 'afkoppelen', 'waar', 'hoe']) expect(await links(a, v)).toBe(await links(b, v));
  // Waar and Hoe each span half the row, starting under the 1st and 4th short cells; Ondergrond starts the next row.
  expect(await links(a, 'waar')).toBe(await links(a, 'bronnen'));
  expect(await links(a, 'hoe')).toBeCloseTo(await links(a, 'diameter'), 0); // col-md-6 and three col-lg-2 round differently
  expect(await links(a, 'ondergrond')).toBe(await links(a, 'bronnen'));

  // Each input fills its column: the whole cell, or for Hoe the column left of its photos.
  for (const [v, invoer] of [['soort', 'select'], ['afkoppelen', 'select'], ['hoe', '.qa-invoer']]) {
    const el = a.locator(`.qa-veld-regenpijp-${v}`).locator(invoer).first();
    const binnen = await el.evaluate((e) => { const kolom = e.closest('[class*="col-"]')!; const c = getComputedStyle(kolom); return kolom.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight); });
    expect(await el.evaluate((e) => e.getBoundingClientRect().width)).toBeCloseTo(binnen, 0);
  }
});

test('de lange labels Regenton aanwezig? (90% groot) en Hoe moet het water komen? (gewoon groot) zijn op één regel afgekapt met een vervaging in plaats van puntjes, en even hoog als de andere labels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await tweeRegenpijpen(page);
  const label = (v: string) => page.locator('.qa-regenpijp').first().locator(`.qa-veld-regenpijp-${v} .form-label`);
  const stijl = (v: string) => label(v).evaluate((el) => { const c = getComputedStyle(el); return { grootte: parseFloat(c.fontSize), wit: c.whiteSpace, overloop: c.overflow, puntjes: c.textOverflow, masker: c.maskImage, hoogte: el.getBoundingClientRect().height }; });
  const gewoon = await stijl('soort');
  for (const [v, factor] of [['regenton', 0.9], ['hoe', 1]] as const) {
    const s = await stijl(v);
    expect(s.grootte).toBeCloseTo(gewoon.grootte * factor, 1);
    expect([s.wit, s.overloop, s.puntjes]).toEqual(['nowrap', 'hidden', 'clip']);
    expect(s.masker).toContain('linear-gradient');
    expect(s.hoogte).toBe(gewoon.hoogte);
  }
});

test('de ** bij Waterberging toont de uitleg als eigen tooltip boven zich bij muis-hover en bij een tik, en de voetnoot staat er nog onder', async ({ page }) => {
  await tweeRegenpijpen(page);
  const uitleg = 'per regenpijp gebaseerd op normafvoer 20 mm regenwater';
  const sterren = page.locator('.qa-waterberging-uitleg').first();
  const tooltip = page.locator('.qa-tip');
  // No browser tooltips anywhere on the page.
  await expect(page.locator('[title]')).toHaveCount(0);
  await sterren.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(uitleg);
  // The arrow's tip touches the top of the ** and points at its middle.
  const [t, pijl, s] = await Promise.all([tooltip, tooltip.locator('.tooltip-arrow'), sterren].map(rechthoek));
  expect(t.width).toBeGreaterThan(50);
  expect(pijl.width).toBeGreaterThan(5);
  expect(t.bottom).toBeLessThan(s.top);
  expect(pijl.bottom).toBeCloseTo(s.top, 0);
  expect(pijl.left + pijl.width / 2).toBeCloseTo(s.left + s.width / 2, 0);
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  // A tap shows it and the next tap hides it; lifting the finger doesn't.
  await sterren.dispatchEvent('pointerup', { pointerType: 'touch' });
  await sterren.dispatchEvent('pointerleave', { pointerType: 'touch' });
  await expect(tooltip).toBeVisible();
  await sterren.dispatchEvent('pointerup', { pointerType: 'touch' });
  await expect(tooltip).toHaveCount(0);
  await expect(page.locator('.qa-regenpijpen')).toContainText(`** ${uitleg}`);
});

test('op 320px blijft de tooltip van de † aan de rechterrand binnen beeld, met de pijl op de †', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await tweeRegenpijpen(page);
  const teken = page.locator('.qa-verdeling-voetnoot-teken');
  await expect(teken).toBeVisible();
  await teken.hover();
  const tooltip = page.locator('.qa-tip');
  await expect(tooltip).toBeVisible();
  const [t, pijl, d] = await Promise.all([tooltip, tooltip.locator('.tooltip-arrow'), teken].map(rechthoek));
  expect(t.width).toBeGreaterThan(50);
  expect(t.left).toBeGreaterThanOrEqual(0);
  expect(t.right).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  expect(pijl.left + pijl.width / 2).toBeCloseTo(d.left + d.width / 2, 0);
});

test('de icoonknoppen van de tekenaar en de ?-link bij de status tonen een eigen tooltip bij muis-hover, niet die van de browser; Dak, Tuin, Steen en Regenpijp geen', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: await kaartPng() });
  await page.locator('.qa-fotoslot-kaart .qa-foto').first().click();
  const kiezen = page.locator('.qa-gereedschap-kies');
  await expect(kiezen).toBeVisible();
  await expect(page.locator('[title]')).toHaveCount(0);
  await kiezen.hover();
  await expect(page.locator('.qa-tip')).toHaveText('Kiezen');
  await expect(page.locator('.qa-tip')).toBeVisible();
  await page.locator('.qa-gereedschap-pijl').hover();
  await expect(page.locator('.qa-tip')).toHaveText('Pijl');
  // Tools that show their name have no tooltip.
  for (const g of ['dak', 'tuin', 'steen', 'regenpijp']) {
    await page.locator(`.qa-gereedschap-${g}`).hover();
    await expect(page.locator(`.qa-gereedschap-${g}`)).toContainText(/\w/);
    await expect(page.locator('.qa-tip')).toHaveCount(0);
  }

  await page.goto(`/dossiers/${id}`);
  const vraag = page.locator('.qa-uitleg-statussen');
  await expect(vraag).toBeVisible();
  await expect(page.locator('[title]')).toHaveCount(0);
  await vraag.hover();
  await expect(page.locator('.qa-tip')).toHaveText('Hoe wordt de status bepaald?');
  await expect(page.locator('.qa-tip')).toBeVisible();
});

test('de Bezoek- en Plan-pagina staan niet in een omkaderd vak met binnenmarge', async ({ page }) => {
  const id = await tweeRegenpijpen(page);
  for (const [pagina, qa] of [['bezoek', '.qa-bezoek'], ['plan', '.qa-plan']]) {
    await page.goto(`/dossiers/${id}/${pagina}`);
    const stijl = await page.locator(qa).evaluate((el) => { const c = getComputedStyle(el); return [c.borderTopWidth, c.paddingLeft]; });
    expect(stijl).toEqual(['0px', '0px']);
  }
});

test('op een telefoon staat de m² van een dakdeel rechtsboven in zijn kaartje en de verdelingsknop op de regel van Regenpijpen:', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await tweeRegenpijpen(page);
  const rij = page.locator('.qa-dak-rij').first();
  const kaartje = await rij.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  const m2 = await rij.locator('.kaart-hoek').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  const titel = await rij.locator('.kaart-titel').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  expect(m2.top - kaartje.top).toBeLessThan(12);
  expect(kaartje.right - m2.right).toBeLessThan(16);
  expect(m2.left).toBeGreaterThan(titel.right);
  expect(m2.top).toBeLessThan(titel.bottom);

  const cel = rij.locator('td[data-label="Regenpijpen"]');
  const knop = rij.locator('.qa-verdeling-knop');
  const [celHoogte, knopHoogte] = await Promise.all([cel, knop].map((l) => l.evaluate((el) => el.getBoundingClientRect().height)));
  expect(celHoogte).toBeLessThan(knopHoogte * 1.5);
});

for (const breedte of [320, 390, 800, 1280]) {
  test(`op ${breedte}px staat de verdelingsknop met zijn † rechts in zijn cel en opent het menu zichtbaar en binnen beeld, rechts uitgelijnd met de knop`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 800 });
    await tweeRegenpijpen(page);
    const rij = page.locator('.qa-dak-rij').first();
    await expect(rij.locator('.qa-verdeling-voetnoot-teken')).toBeVisible();
    const cel = await rij.locator('td[data-label="Regenpijpen"]').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    const knop = await rij.locator('.qa-verdeling-knop').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    const teken = await rechthoek(rij.locator('.qa-verdeling-voetnoot-teken'));
    expect(cel.right - teken.right).toBeLessThan(8);
    expect(teken.left - knop.right).toBeLessThan(8);

    await rij.locator('.qa-verdeling-knop').click();
    // A hidden menu measures 0×0 at the origin, which would pass the bounds checks below.
    await expect(rij.locator('.dropdown-menu')).toBeVisible();
    const menu = await rij.locator('.dropdown-menu').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    const schermBreedte = await page.evaluate(() => document.documentElement.clientWidth);
    expect(menu.width).toBeGreaterThan(100);
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(schermBreedte);
    expect(Math.abs(menu.right - knop.right)).toBeLessThan(2);
  });
}

test('de kop Regenpijp A staat op elke breedte op een eigen regel boven de velden van het blok', async ({ page }) => {
  for (const breedte of [390, 800, 1280]) {
    await page.setViewportSize({ width: breedte, height: 800 });
    await tweeRegenpijpen(page);
    const blok = page.locator('.qa-regenpijp').first();
    await expect(blok.locator('.qa-regenpijp-titel')).toHaveText('Regenpijp A');
    const [kop, cel] = await Promise.all([blok.locator('.qa-regenpijp-kop'), blok.locator('.qa-veld-regenpijp-bronnen')].map(rechthoek));
    expect(cel.top).toBeGreaterThanOrEqual(kop.bottom);
  }
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

for (const [scherm, breedte] of [['een laptop', 1280], ['een telefoon', 390]] as const) {
  test(`in de verdeling op ${scherm} blijft het een tabel en staat het %-teken op één regel naast zijn invulveld`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 800 });
    await tweeRegenpijpen(page);
    await page.locator('.qa-verdeling-knop').click();
    const pijp = page.locator('.qa-verdeling-pijp').first();
    expect(await pijp.evaluate((el) => getComputedStyle(el).display)).toBe('table-row');
    const veld = await vak(pijp.locator('.qa-verdeling-pct'));
    const teken = await vak(pijp.locator('.input-group-text'));
    expect(teken.top).toBe(veld.top);
  });
}

test('in de verdeling past een getal van twee cijfers in het %-veld naast de pijltjes die de browser bij hover toont', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[10, 5]] },
    ],
    'dak.d1.verdeling': { r1: 67, r2: 33 },
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  await page.locator('.qa-verdeling-knop').click();
  const pct = page.locator('.qa-verdeling-pct').first();
  await expect(pct).toBeVisible();
  await expect(pct).toHaveValue('67');
  await pct.hover();
  const { client, scroll } = await pct.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(client).toBeGreaterThan(0);
  expect(scroll).toBeLessThanOrEqual(client);
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

test('een automatisch over 2+ regenpijpen verdeeld dakdeel krijgt in de Dak-tabel en in het Plan een † met voetnoot; met één regenpijp of met de hand verdeeld niet', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'd2', type: 'dak', p: [[100, 0], [110, 0], [110, 10], [100, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[0, 5]] },
      { id: 'r2', type: 'regenpijp', p: [[10, 5]] },
      { id: 'r3', type: 'regenpijp', p: [[105, 5]] },
    ],
    'dak.d1.m2': 40,
    'dak.d2.m2': 10,
  });
  await page.goto(`/dossiers/${id}/bezoek`);
  const d1 = page.locator('#veld-dak\\.d1\\.verdeling');
  const voetnoot = page.locator('.qa-verdeling-voetnoot');
  await expect(d1.locator('.qa-verdeling-knop')).toHaveText('A 50% · B 50%');
  const teken = d1.locator('.qa-verdeling-voetnoot-teken');
  await expect(teken).toBeVisible();
  await expect(teken).toHaveText('†');
  // Right after the dropdown, on the same line.
  const [knop, t] = await Promise.all([d1.locator('.qa-verdeling-knop'), teken].map(rechthoek));
  expect(t.left).toBeGreaterThanOrEqual(knop.right);
  expect(t.top).toBeLessThan(knop.bottom);
  await expect(page.locator('#veld-dak\\.d2\\.verdeling .qa-verdeling-voetnoot-teken')).toHaveCount(0);
  await expect(voetnoot).toBeVisible();
  await expect(voetnoot).toHaveText('† automatisch verdeeld: elk stuk dak gaat naar de dichtstbijzijnde regenpijp (Voronoi-verdeling)');
  let plan = await planTekst(page, id);
  expect(plan).toContain('A 50% · B 50%†');
  expect(plan).toContain('† automatisch verdeeld: elk stuk dak gaat naar de dichtstbijzijnde regenpijp (Voronoi-verdeling)');

  await zet(page, id, { 'dak.d1.verdeling': { r1: 70, r2: 30 } });
  await page.reload();
  await expect(d1.locator('.qa-verdeling-knop')).toHaveText('A 70% · B 30%');
  await expect(teken).toHaveCount(0);
  await expect(voetnoot).toHaveCount(0);
  plan = await planTekst(page, id);
  expect(plan).toContain('A 70% · B 30%');
  expect(plan).not.toContain('†');
});

test('de hint bij hoosbuien eindigt met een tip over hoogteverschillen', async ({ page }) => {
  await tweeRegenpijpen(page);
  await expect(page.locator('.qa-veld-hoosbuien .form-text')).toHaveText(/Let goed op bij hoogteverschillen!$/);
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

test('de afspraken staan op de Bezoek-pagina onder de wensen, niet bij het Plan van Aanpak; toestemming vragen alleen bij een huurwoning', async ({ page }) => {
  await start(page);
  const koop = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${koop}/bezoek`);
  const afspraken = page.locator('.qa-afspraken');
  for (const k of ['bewoner_doet', 'ulebelt_doet']) await expect(afspraken.locator(`.qa-veld-${k}`)).toBeVisible();
  expect((await rechthoek(afspraken)).top).toBeGreaterThan((await rechthoek(page.locator('.qa-veld-wensen'))).bottom - 0.5);
  await expect(afspraken.locator('.qa-veld-ulebelt_doet .qa-suggestie-holie_molie')).toBeVisible();
  await expect(afspraken.locator('.qa-suggestie-toestemming')).toHaveCount(0);

  await page.goto(`/dossiers/${koop}/plan`);
  await expect(page.locator('.qa-plan .qa-veld-beoordeling')).toBeVisible();
  await expect(page.locator('.qa-veld-bewoner_doet')).toHaveCount(0);

  const huur = await nieuwDossier(page, { huurKoop: 'huur' });
  await page.goto(`/dossiers/${huur}/bezoek`);
  await expect(page.locator('.qa-afspraken .qa-suggestie-toestemming')).toBeVisible();
});

test('een afspraak is een tekstvak met een • voor elke regel; de links erboven voegen een gangbare regel toe, en lege regels verdwijnen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const v = veld(page, 'bewoner_doet');
  const vak = v.locator('textarea');
  await vak.click();
  await page.keyboard.type('Voor 1 mei');
  await expect(vak).toHaveValue('• Voor 1 mei');
  await page.keyboard.press('Enter');
  await expect(vak).toHaveValue('• Voor 1 mei\n• ');
  await page.keyboard.press('Enter');
  await expect(vak).toHaveValue('• Voor 1 mei\n• ');
  await vak.blur();
  await expect(vak).toHaveValue('• Voor 1 mei');

  await v.locator('.qa-suggestie-opruimen').click();
  await expect(vak).toHaveValue('• Voor 1 mei\n• Tuin opruimen op plek regenton');
  await expect(v.locator('.qa-suggestie-opruimen')).toHaveCount(0);
  await expect(v.locator('.qa-suggestie-steen')).toBeVisible();
  await vak.fill('Plakken\n\nzonder bullets');
  await expect(vak).toHaveValue('• Plakken\n\n• zonder bullets');
  await expect(v.locator('.qa-suggestie-opruimen')).toBeVisible();
  await opslagKlaar(page);

  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(vak).toHaveValue('• Plakken\n• zonder bullets');
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-sv-bewoner_doet li')).toHaveText(['Plakken', 'zonder bullets']);
  expect(await planTekst(page, id)).toMatch(/Wat gaat de bewoner doen\?\s*Plakken\s*zonder bullets\s*Wat gaat De Ulebelt doen\?/);
});

test('de voorgestelde werkzaamheden zijn een tekstvak met een • per regel en suggesties erboven, en het Plan van Aanpak heeft geen apart veld Werkzaamheden meer', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/plan`);
  const v = veld(page, 'voorstel');
  const vak = v.locator('textarea');
  await vak.fill('Wadi graven');
  await v.locator('.qa-suggestie-afzagen').click();
  await expect(vak).toHaveValue('• Wadi graven\n• Regenpijp afzagen en het restant afdoppen');
  await expect(v.locator('.qa-suggestie-afzagen')).toHaveCount(0);
  await expect(v.locator('.qa-suggestie-regenton')).toBeVisible();
  await expect(page.locator('.qa-veld-werkzaamheden')).toHaveCount(0);
  await opslagKlaar(page);

  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-sv-voorstel li')).toHaveText(['Wadi graven', 'Regenpijp afzagen en het restant afdoppen']);
  const plan = await planTekst(page, id);
  expect(plan).toMatch(/De Ulebelt stelt de volgende werkzaamheden voor:\s*Wadi graven\s*Regenpijp afzagen en het restant afdoppen\s*Afspraken/);
  expect(plan).toContain('5. Materialenlijst');
  expect(plan).not.toContain('Materialenlijst en uitvoering');
});

test('op een telefoon past de materialentabel zonder zijwaarts scrollen, met smalle Prijs en Aantal, geen menukolom en de meeste ruimte voor Materiaal', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/dossiers/${id}/plan`);
  const rij = page.locator('.qa-materialen-materialen .qa-materiaal-rij').first();
  await expect(rij).toBeVisible();
  const scroller = page.locator('.qa-veld-materialen .table-responsive');
  expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const [naam, prijs, aantal] = await Promise.all(['naam', 'prijs', 'aantal'].map(async (k) => (await rij.locator(`.qa-materiaal-${k}`).boundingBox())!.width));
  expect(prijs).toBeLessThan(80);
  expect(aantal).toBeLessThan(65);
  expect(naam).toBeGreaterThan(prijs + aantal);
  await expect(rij.locator('.qa-materiaal-menu')).toBeHidden();
});

test('een materiaalregel verwijder je via het menu achter de regel: de knop opent het menu, Verwijderen haalt de regel weg', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/plan`);
  const rijen = page.locator('.qa-materialen-materialen .qa-materiaal-rij');
  const aantal = await rijen.count();
  const laatste = rijen.last();
  const naam = await laatste.locator('.qa-materiaal-naam').inputValue();

  await expect(laatste.locator('.qa-materiaal-weg')).toBeHidden();
  await laatste.locator('.qa-materiaal-menu').click();
  const weg = laatste.locator('.qa-materiaal-weg');
  await expect(weg).toBeVisible();
  // Not clipped by the scrolling .table-responsive: the item itself is what sits at its centre.
  expect(await weg.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(weg).toBeHidden();
  await expect(rijen).toHaveCount(aantal);

  await laatste.locator('.qa-materiaal-menu').click();
  await weg.click();
  await expect(rijen).toHaveCount(aantal - 1);
  await expect(rijen.last().locator('.qa-materiaal-naam')).not.toHaveValue(naam);
  await opslagKlaar(page);
  await page.reload();
  await expect(rijen).toHaveCount(aantal - 1);
});

test('een regel toevoegen via een link zet de cursor aan het eind van het tekstvak en scrollt de nieuwe regel in beeld', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const v = veld(page, 'bewoner_doet');
  const vak = v.locator('textarea');
  await vak.fill('Een\nTwee\nDrie\nVier\nVijf\nZes');
  await vak.blur();
  await expect(vak).not.toBeFocused();
  await v.locator('.qa-suggestie-steen').click();
  await expect(vak).toBeFocused();
  await expect(vak).toHaveValue(/• Steen van 60x60 regelen voor onder regenton$/);
  const stand = await vak.evaluate((el: HTMLTextAreaElement) => ({ cursor: el.selectionStart, eind: el.value.length, onder: el.scrollHeight - el.clientHeight - el.scrollTop }));
  expect(stand.cursor).toBe(stand.eind);
  expect(stand.onder).toBeLessThanOrEqual(1);
});

test('op een smal scherm loopt een te lange suggestielink niet door op een tweede regel en maakt hij de pagina niet breder, maar wordt hij afgeknipt', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await page.setViewportSize({ width: 300, height: 800 });
  await page.goto(`/dossiers/${id}/bezoek`);
  const links = page.locator('.qa-afspraken .qa-suggestie');
  await expect(links.first()).toBeVisible();
  const maten = await links.evaluateAll((els) => els.map((el) => ({ hoog: el.getBoundingClientRect().height, regel: parseFloat(getComputedStyle(el).lineHeight), breed: el.scrollWidth, zichtbaar: el.clientWidth })));
  expect(maten.length).toBeGreaterThan(0);
  for (const m of maten) expect(m.hoog).toBeLessThan(m.regel * 1.5);
  expect(maten.some((m) => m.breed > m.zichtbaar)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('een afsprakenvak groeit mee met de tekst, van 3 tot 5,4 regels hoog', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const vak = veld(page, 'bewoner_doet').locator('textarea');
  await expect(vak).toBeVisible();
  // Height of the text area in lines, without padding and border.
  const regels = () => vak.evaluate((el: HTMLTextAreaElement) => {
    const s = getComputedStyle(el);
    const rand = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
    return (el.getBoundingClientRect().height - rand) / parseFloat(s.lineHeight);
  });
  expect(await regels()).toBeCloseTo(3, 1);
  await vak.fill('1\n2\n3\n4');
  expect(await regels()).toBeCloseTo(4, 1);
  await vak.fill('1\n2\n3\n4\n5\n6\n7\n8');
  expect(await regels()).toBeCloseTo(5.4, 1);
  await page.reload();
  await expect(vak).toBeVisible();
  expect(await regels()).toBeCloseTo(5.4, 1);
});
