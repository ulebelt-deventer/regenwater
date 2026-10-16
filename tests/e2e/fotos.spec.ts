// Photo slots in a real browser: drag and drop, the replace question, conversion failures and the fetched boorprofiel. The server side is in app.test.ts and fotos.test.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { ja, nieuwDossier, opslagKlaar, start, veld, vul, zet } from './hulp.ts';

const PNG = (await sharp({ create: { width: 400, height: 300, channels: 3, background: '#88d356' } }).png().toBuffer()).toString('base64');
const PDF = Buffer.from('%PDF-1.4\n%nep\n').toString('base64');

interface Bestand {
  naam: string;
  type: string;
  base64: string;
}

// Drags files onto a slot the way a desktop browser does: dragover, then drop with a DataTransfer holding the files.
async function sleep(page: Page, slot: Locator, bestanden: Bestand[]): Promise<void> {
  const dt = await page.evaluateHandle((bs) => {
    const d = new DataTransfer();
    for (const b of bs) d.items.add(new File([Uint8Array.from(atob(b.base64), (c) => c.charCodeAt(0))], b.naam, { type: b.type }));
    return d;
  }, bestanden);
  await slot.dispatchEvent('dragover', { dataTransfer: dt });
  await slot.dispatchEvent('drop', { dataTransfer: dt });
}

const png = (naam: string): Bestand => ({ naam, type: 'image/png', base64: PNG });

async function nieuwBezoekDossier(page: Page): Promise<number> {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  return id;
}

test('een gesleepte PDF geeft een rode melding met de bestandsnaam en wordt niet geüpload', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  const slot = page.locator('.qa-fotoslot-straatfoto');
  await sleep(page, slot, [{ naam: 'rapport.pdf', type: 'application/pdf', base64: PDF }]);
  await expect(page.locator('.qa-melding-danger')).toContainText('rapport.pdf kon niet worden toegevoegd. Gebruik een JPG- of PNG-afbeelding.');
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(0);
});

test('Plakken zet een afbeelding van het klembord in het vak, en meldt het als er geen afbeelding op staat', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');

  await page.evaluate(() => navigator.clipboard.writeText('alleen tekst'));
  await slot.locator('.qa-foto-toevoegen').click();
  await slot.locator('.qa-foto-plakken').click();
  await expect(page.locator('.qa-melding-danger')).toContainText('Er staat geen afbeelding op het klembord. Kopieer eerst een afbeelding.');

  await page.evaluate(async (b64) => {
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, PNG);
  await slot.locator('.qa-foto-toevoegen').click();
  await slot.locator('.qa-foto-plakken').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
});

test('⌘V in een vak plakt gekopieerde bestanden, zoals uit Finder', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.evaluate((el, b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'uit-finder.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
});

test('een PDF en een foto tegelijk: de foto komt erbij, de PDF geeft een melding', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [{ naam: 'offerte.pdf', type: 'application/pdf', base64: PDF }, png('tuin.png')]);
  await expect(page.locator('.qa-melding-danger')).toContainText('offerte.pdf kon niet worden toegevoegd.');
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
});

test('een bestand zonder afbeelding erin, ook met een afbeeldingtype, geeft dezelfde melding', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [{ naam: 'kapot.jpg', type: 'image/jpeg', base64: PDF }]);
  await expect(page.locator('.qa-melding-danger')).toContainText('kapot.jpg kon niet worden toegevoegd.');
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(0);
});

test('op een telefoon zijn de foto’s in elk vak voor meerdere foto’s 7rem brede 3:2-duimnagels naast elkaar, de eerste recht onder het label', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const id = await nieuwBezoekDossier(page);
  await zet(page, id, {
    kaart_annotaties: [
      { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
      { id: 't1', type: 'tuin', p: [[0, 0], [10, 0], [10, 10]] },
      { id: 's1', type: 'steen', p: [[20, 0], [30, 0], [30, 10]] },
    ],
    'regenpijp.r1.regenton': 'gewenst', // shows Ondergrond
  });
  await page.reload();
  for (const v of ['regenpijp-hoe', 'regenpijp-waar', 'regenpijp-ondergrond', 'tuinsituatie', 'tuin', 'steen']) {
    const slot = page.locator(`.qa-fotoslot-${v}`);
    await sleep(page, slot, [png('een.png'), png('twee.png')]);
    const fotos = slot.locator('.qa-foto');
    await expect(fotos).toHaveCount(2);
    const [een, twee] = await Promise.all([0, 1].map((i) => fotos.nth(i).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)));
    expect(een.width).toBeCloseTo(7 * 16, 0);
    expect(een.width / een.height).toBeCloseTo(1.5, 1);
    expect(twee.top).toBe(een.top);
    expect(twee.left).toBeGreaterThan(een.right);
    // Tuin and steen rows have no form label.
    if (v !== 'tuin' && v !== 'steen') expect(een.left).toBe(await veld(page, v).locator('.form-label').evaluate((el) => el.getBoundingClientRect().left));
  }
  await opslagKlaar(page);
});

test('met twee foto’s in een vak staat alleen op de laatste foto een +, die 5px buiten zijn rechteronderhoek uitsteekt, met dezelfde randkleur als de knop van een leeg vak', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const id = await nieuwBezoekDossier(page);
  await zet(page, id, { kaart_annotaties: [{ id: 'r1', type: 'regenpijp', p: [[1, 1]] }] });
  await page.reload();
  const slot = page.locator('.qa-fotoslot-regenpijp-waar');
  await sleep(page, slot, [png('een.png'), png('twee.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(2);
  const plus = slot.locator('.qa-foto-toevoegen');
  await expect(plus).toHaveCount(1);
  await expect(plus).toBeVisible();
  await expect(plus.locator('.bi-plus-lg')).toHaveCount(1);
  await expect(plus.locator('.bi-image')).toHaveCount(0);
  const [laatste, p] = await Promise.all([slot.locator('.qa-foto').nth(1), plus].map((l) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)));
  expect(p.width).toBeGreaterThan(10);
  expect(p.width).toBeLessThan(laatste.width / 2);
  for (const uitsteek of [p.right - laatste.right, p.bottom - laatste.bottom]) expect(uitsteek).toBeCloseTo(5, 0);
  const rand = (l: Locator) => l.evaluate((el) => getComputedStyle(el).borderBottomColor);
  const leeg = page.locator('.qa-fotoslot-regenpijp-hoe .qa-foto-toevoegen');
  await expect(leeg).toBeVisible();
  expect(await rand(plus)).toBe(await rand(leeg));
  await opslagKlaar(page);
});

test('een tweede foto op een vak met één foto vraagt vervangen of toevoegen', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);

  await sleep(page, slot, [png('twee.png')]);
  await expect(page.locator('.qa-bevestig .qa-toevoegen')).toHaveClass(/btn-success/);
  await expect(page.locator('.qa-bevestig .qa-toevoegen .bi-plus-lg')).toHaveCount(1);
  await expect(page.locator('.qa-bevestig .qa-vervangen')).toHaveClass(/btn-warning/);
  await expect(page.locator('.qa-bevestig .qa-vervangen .bi-arrow-left-right')).toHaveCount(1);
  await page.locator('.qa-bevestig .qa-toevoegen').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(2);

  // With two photos there is nothing to replace, so a third is just added.
  await sleep(page, slot, [png('drie.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(3);
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
});

test('de vraag toevoegen of vervangen sluiten met het kruisje of Annuleren voegt niets toe', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
  const eerste = await slot.locator('.qa-foto image').getAttribute('href');

  await sleep(page, slot, [png('twee.png')]);
  await page.locator('.qa-bevestig .btn-close').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await sleep(page, slot, [png('drie.png')]);
  await page.locator('.qa-bevestig .qa-annuleren').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);

  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto-wacht')).toHaveCount(0);
  await expect(slot.locator('.qa-foto image')).toHaveAttribute('href', eerste!);
});

test('een leeg vak heeft één knop + afbeelding, die een pop-up opent met Uploaden, Plakken en slepen maar zonder Camera op een computer; daarna voegt de + op de foto er meer toe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  const knop = slot.locator('.qa-foto-toevoegen');
  await expect(knop).toHaveCount(1);
  await expect(knop.locator('.bi-plus-lg')).toHaveCount(1);
  await expect(knop.locator('.bi-image')).toHaveCount(1);
  await expect(slot.locator('.dropdown-menu')).toBeHidden();
  await knop.click();
  const menu = slot.locator('.dropdown-menu');
  await expect(menu).toBeVisible();
  for (const optie of ['.qa-foto-kiezen', '.qa-foto-plakken']) await expect(menu.locator(optie)).toBeVisible();
  await expect(menu.locator('.qa-foto-maken')).toHaveCount(0);
  await expect(menu).toContainText('Of hierheen slepen.');
  const [kiezer] = await Promise.all([page.waitForEvent('filechooser'), menu.locator('.qa-foto-kiezen').click()]);
  await kiezer.setFiles({ name: 'een.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await expect(slot.locator('.qa-foto')).toHaveCount(1);

  await knop.click();
  const [kiezer2] = await Promise.all([page.waitForEvent('filechooser'), slot.locator('.dropdown-menu .qa-foto-kiezen').click()]);
  await kiezer2.setFiles({ name: 'twee.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await page.locator('.qa-bevestig .qa-toevoegen').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(2);
  await opslagKlaar(page);
});

test.describe('op een aanraakscherm', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  test('heeft de pop-up van een leeg vak een optie Camera', async ({ page }) => {
    await nieuwBezoekDossier(page);
    const slot = page.locator('.qa-fotoslot-tuinsituatie');
    await slot.locator('.qa-foto-toevoegen').click();
    await expect(slot.locator('.dropdown-menu .qa-foto-maken')).toBeVisible();
    await expect(slot.locator('.dropdown-menu .qa-foto-maken')).toHaveText('Camera');
  });
});

test('een foto gesleept op de geopende pop-up van een vak komt in dat vak', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.locator('.qa-foto-toevoegen').click();
  const menu = slot.locator('.dropdown-menu');
  await expect(menu).toBeVisible();
  await sleep(page, menu, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
});

test('de kaart staat er heel en 16,5rem breed', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const kaart = page.locator('.qa-fotoslot-kaart');
  await sleep(page, kaart, [png('kaart.png')]);
  await expect(kaart.locator('.qa-foto')).toHaveCount(1);
  const k = (await kaart.locator('.qa-foto').boundingBox())!;
  expect(k.width).toBeCloseTo(16.5 * 16, 0);
  expect(k.width / k.height).toBeCloseTo(400 / 300, 1);
  await expect(kaart.locator('.qa-foto svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  await opslagKlaar(page);
});

test('een vak voor één foto, zoals de straatfoto, heeft met een foto geen +, vraagt bij een gesleepte foto of die de oude vervangt, en krijgt na verwijderen zijn knop terug', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  const slot = page.locator('.qa-fotoslot-straatfoto');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto-toevoegen')).toHaveCount(0);
  const eerste = await slot.locator('.qa-foto image').getAttribute('href');

  await sleep(page, slot, [png('twee.png')]);
  await expect(page.locator('.qa-bevestig')).toContainText('Hier past maar één foto');
  await page.locator('.qa-bevestig .qa-nee').click();
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto image')).toHaveAttribute('href', eerste!);

  await sleep(page, slot, [png('twee.png')]);
  await ja(page);
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto image')).not.toHaveAttribute('href', eerste!);

  await slot.locator('.qa-foto').click();
  await page.locator('.qa-foto-verwijderen').click();
  await ja(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(0);
  await expect(slot.locator('.qa-foto-toevoegen')).toBeVisible();
  await sleep(page, slot, [png('twee.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
});

test('op een vak voor één foto is de duimnagel 7rem breed, 3:2, met een rand', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  const slot = page.locator('.qa-fotoslot-straatfoto');
  await sleep(page, slot, [png('straat.png')]);
  const duim = slot.locator('.qa-foto');
  await expect(duim).toHaveCount(1);
  const d = (await duim.boundingBox())!;
  expect(d.width).toBeCloseTo(7 * 16, 0);
  expect(d.width / d.height).toBeCloseTo(1.5, 1);
  await expect(duim).toHaveCSS('border-top-width', '1px');
  await expect(duim).not.toHaveCSS('border-top-left-radius', '0px');
});

test('vervangen haalt de oude foto weg', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  const oud = await slot.locator('.qa-foto image').getAttribute('href');

  await sleep(page, slot, [png('twee.png')]);
  await page.locator('.qa-bevestig .qa-vervangen').click();
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto image')).not.toHaveAttribute('href', oud!);
});

test('meerdere foto’s tegelijk op een vak met één foto worden zonder vraag toegevoegd', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await sleep(page, slot, [png('twee.png'), png('drie.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(3);
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
});

test('een vervangen kaart houdt de tekeningen en waarschuwt dat ze misschien niet meer kloppen', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-kaart');
  await sleep(page, slot, [png('kaart1.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(page.locator('.qa-kaart-vervangen')).toHaveCount(0);
  await tekenRegenpijp(page);

  await sleep(page, slot, [png('kaart2.png')]);
  await expect(page.locator('.qa-kaart-vervangen')).toHaveCount(0);
  await ja(page);
  await expect(page.locator('.qa-kaart-vervangen')).toBeVisible();
  await opslagKlaar(page);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(page.locator('.qa-regenpijp')).toHaveCount(1);
});

test('de dichtstbijzijnde boring zet het boorprofiel en de boorlocatie, en vervangt ze pas na bevestiging', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  const slot = page.locator('.qa-fotoslot-boorprofiel');
  const locatie = veld(page, 'boorlocatie').locator('.qa-invoer');
  await page.locator('.qa-boring').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(locatie).toHaveValue(/^Walstraat, Deventer: boring \w+ \(DINOloket\), \d+ m van het huis$/);
  const oud = await slot.locator('.qa-foto image').getAttribute('href');

  await vul(page, 'boorlocatie', 'Zelf ingevuld');
  await opslagKlaar(page);
  await page.locator('.qa-boring').click();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(locatie).toHaveValue('Zelf ingevuld');
  await expect(slot.locator('.qa-foto image')).toHaveAttribute('href', oud!);

  await page.locator('.qa-boring').click();
  await ja(page);
  await expect(locatie).toHaveValue(/DINOloket/);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-foto image')).not.toHaveAttribute('href', oud!);
});

// Opens the kaart and places one regenpijp in the middle.
async function tekenRegenpijp(page: Page): Promise<void> {
  await page.locator('.qa-fotoslot-kaart .qa-foto').click();
  await page.locator('.qa-gereedschap-regenpijp').click();
  const vlak = page.locator('.qa-tekenvlak');
  const box = (await vlak.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('.qa-tekenaar-sluiten').click();
  await opslagKlaar(page);
}

test('tijdens het uploaden staat er Uploaden... bij het vak, de wachtende foto blijft duimnagelgroot, en de pagina blijft op dezelfde plek staan', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const id = await nieuwBezoekDossier(page);
  // Holds the upload until the test has seen the indicator.
  let laatGaan!: () => void;
  const losgelaten = new Promise<void>((ok) => (laatGaan = ok));
  await page.route(`**/api/dossiers/${id}/fotos/**`, async (r) => {
    await losgelaten;
    await r.continue();
  });
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 200, behavior: 'instant' }));
  const voor = await page.evaluate(() => window.scrollY);
  expect(voor).toBeGreaterThan(0);

  const groot = (await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#462832' } }).png().toBuffer()).toString('base64');
  await sleep(page, slot, [{ naam: 'tuin.png', type: 'image/png', base64: groot }]);
  await expect(slot.locator('.qa-uploaden')).toContainText('Uploaden...');
  const wacht = (await slot.locator('.qa-foto-wacht img').boundingBox())!;
  expect(wacht.width).toBeLessThan(180);
  expect(wacht.height).toBeLessThan(130);
  expect(await page.evaluate(() => window.scrollY)).toBe(voor);
  laatGaan();
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(slot.locator('.qa-uploaden')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(voor);
});

test('bij een veld met foto’s staan label en hint over de volle breedte boven de invoer, met het fotovak vanaf md rechts naast de invoer en op een telefoon eronder', async ({ page }) => {
  for (const [breedte, ernaast] of [[390, false], [1280, true]] as const) {
    await page.setViewportSize({ width: breedte, height: 800 });
    await nieuwBezoekDossier(page);
    const v = veld(page, 'hoosbuien');
    const [cel, label, hint, invoer, slot] = await Promise.all([v, v.locator('.form-label'), v.locator('.form-text'), v.locator('.qa-invoer'), v.locator('.qa-fotoslot')].map((l) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)));
    expect(hint.height).toBeGreaterThan(0);
    for (const r of [label, hint]) expect(r.width).toBeCloseTo(cel.width, 0);
    expect(hint.top).toBeGreaterThanOrEqual(label.bottom);
    expect(invoer.top).toBeGreaterThanOrEqual(hint.bottom);
    if (ernaast) {
      expect(slot.top).toBe(invoer.top);
      expect(slot.left).toBeGreaterThan(invoer.right);
    } else expect(slot.top).toBeGreaterThan(invoer.bottom);
  }
});

test('in het Plan van Aanpak staan vooraanzicht en kaart naast elkaar, en boorprofiel en doorlaatbaarheid ook', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  for (const slot of ['straatfoto', 'kaart', 'boorprofiel']) {
    const res = await page.request.post(`/api/dossiers/${id}/fotos/${slot}`, { data: Buffer.from(PNG, 'base64'), headers: { 'Content-Type': 'image/png' } });
    expect(res.status()).toBe(201);
  }
  await page.goto(`/docs/dossiers/${id}/concept-plan`);
  const naastElkaar = async (links: string, rechts: string) => {
    const [l, r, blad] = [(await page.locator(links).boundingBox())!, (await page.locator(rechts).boundingBox())!, (await page.locator('.blad').boundingBox())!];
    expect(Math.abs(l.y - r.y)).toBeLessThan(2);
    expect(r.x).toBeGreaterThanOrEqual(l.x + l.width);
    expect(l.width).toBeLessThan(blad.width / 2);
    expect(r.width).toBeLessThan(blad.width / 2);
  };
  await naastElkaar('.qa-pdf-straatfoto', '.qa-pdf-kaart');
  await naastElkaar('.qa-pdf-boorprofiel', '.qa-pdf-doorlaatbaarheid');
});
