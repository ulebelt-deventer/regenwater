// Photo slots in a real browser: drag and drop, the replace question, conversion failures and the fetched boorprofiel. The server side is in app.test.ts and fotos.test.ts.
import { type Locator, type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { ja, nieuwDossier, opslagKlaar, start, veld, vul } from './hulp.ts';

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

test('een tweede foto op een vak met één foto vraagt vervangen of toevoegen', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);

  await sleep(page, slot, [png('twee.png')]);
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(slot.locator('.qa-foto')).toHaveCount(2);

  // With two photos there is nothing to replace, so a third is just added.
  await sleep(page, slot, [png('drie.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(3);
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
});

test('vervangen haalt de oude foto weg', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await sleep(page, slot, [png('een.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  const oud = await slot.locator('.qa-foto image').getAttribute('href');

  await sleep(page, slot, [png('twee.png')]);
  await page.locator('.qa-bevestig .qa-ja').click();
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

test('een nieuwe kaart houdt de tekeningen en waarschuwt dat ze misschien niet meer kloppen', async ({ page }) => {
  await nieuwBezoekDossier(page);
  const slot = page.locator('.qa-fotoslot-kaart');
  await sleep(page, slot, [png('kaart1.png')]);
  await expect(slot.locator('.qa-foto')).toHaveCount(1);
  await expect(page.locator('.qa-kaart-vervangen')).toHaveCount(0);
  await tekenRegenpijp(page);

  await sleep(page, slot, [png('kaart2.png')]);
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
