// The drawing tool in a real browser: closing shapes, Escape, linking regenpijpen to daken, deleting with undo, and renumbering. Geometry and labels are in src/shared/kaart.test.ts.
import { type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { ja, nieuwDossier, opslagKlaar, start } from './hulp.ts';

const PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#e8e8e8' } }).png().toBuffer();

interface Annotatie {
  id: string;
  type: string;
  p: [number, number][];
  tekst?: string;
}

async function serverDossier(page: Page, id: number): Promise<{ data: Record<string, unknown>; fotos: { slot: string; annotaties: Annotatie[] }[] }> {
  const res = await page.request.get(`/api/dossiers/${id}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { dossier: { data: Record<string, unknown>; fotos: { slot: string; annotaties: Annotatie[] }[] } }).dossier;
}

// An empty drawing is stored as no key at all.
async function kaart(page: Page, id: number): Promise<Annotatie[]> {
  const { data } = await serverDossier(page, id);
  return 'kaart_annotaties' in data ? (data.kaart_annotaties as Annotatie[]) : [];
}

// A koop dossier on its Bezoek page with a kaart uploaded and the drawing tool open.
async function openKaart(page: Page): Promise<number> {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const slot = page.locator('.qa-fotoslot-kaart');
  await slot.locator('.qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: PNG });
  await openTekenaar(page, 'kaart');
  return id;
}

// Opens a slot's first photo and waits until the view matches the drawing area's measured size; until then taps map to the wrong image spot.
async function openTekenaar(page: Page, slot: string, duim = page.locator(`.qa-fotoslot-${slot} .qa-foto`)): Promise<void> {
  await duim.first().click();
  await expect
    .poll(() =>
      page.locator('.qa-tekenaar-svg').evaluate((svg: SVGSVGElement) => {
        const v = svg.viewBox.baseVal;
        return Math.abs(v.width / v.height - svg.clientWidth / svg.clientHeight) < 0.01;
      }),
    )
    .toBe(true);
}

// The screen spot of a fraction of the photo. The toolbar can wrap and resize the drawing area between taps, so a fixed screen spot would drift.
async function schermPunt(page: Page, fx: number, fy: number): Promise<[number, number]> {
  return page.locator('.qa-tekenaar-svg').evaluate(
    (svg: SVGSVGElement, [fx, fy]) => {
      const img = svg.querySelector('image')!;
      const p = new DOMPoint(img.width.baseVal.value * fx, img.height.baseVal.value * fy).matrixTransform(svg.getScreenCTM()!);
      return [p.x, p.y] as [number, number];
    },
    [fx, fy],
  );
}

async function tik(page: Page, fx: number, fy: number, vinger = false): Promise<void> {
  const [x, y] = await schermPunt(page, fx, fy);
  if (vinger) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function gereedschap(page: Page, naam: string): Promise<void> {
  await page.locator(`.qa-gereedschap-${naam}`).click();
}

async function sluitTekenaar(page: Page): Promise<void> {
  await page.locator('.qa-tekenaar-sluiten').click();
  await expect(page.locator('.qa-tekenaar')).toHaveCount(0);
  await opslagKlaar(page);
}

// The page's corner save indicator stays visible over the drawing tool, which has none of its own.
async function tekenaarOpgeslagen(page: Page): Promise<void> {
  await expect(page.locator('.qa-tekenaar .qa-opslag-status')).toHaveCount(0);
  await opslagKlaar(page);
}

const VIERKANT: [number, number][] = [
  [0.4, 0.4],
  [0.6, 0.4],
  [0.6, 0.6],
  [0.4, 0.6],
];

test('een dak sluit door weer op het eerste punt te tikken', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'dak');
  for (const [x, y] of VIERKANT) await tik(page, x, y);
  await tik(page, ...VIERKANT[0]);
  await expect(page.locator('.qa-klaar')).toHaveCount(0);
  await sluitTekenaar(page);

  const annots = await kaart(page, id);
  expect(annots.map((a) => [a.type, a.p.length])).toEqual([['dak', 4]]);
  await expect(page.locator('.qa-dak-rij')).toHaveCount(1);
  await expect(page.locator('.qa-dak-rij')).toContainText('D1');
  await expect(page.locator('.qa-geen-dak')).toHaveCount(0);
});

test('de knop Klaar verschijnt pas bij drie punten en sluit de tuin', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'tuin');
  await tik(page, 0.3, 0.3);
  await tik(page, 0.5, 0.3);
  await expect(page.locator('.qa-klaar')).toHaveCount(0);
  await tik(page, 0.4, 0.5);
  await page.locator('.qa-klaar').click();
  await expect(page.locator('.qa-klaar')).toHaveCount(0);
  await sluitTekenaar(page);

  expect((await kaart(page, id)).map((a) => [a.type, a.p.length])).toEqual([['tuin', 3]]);
  await expect(page.locator('.qa-tuin-rij')).toHaveCount(1);
  await expect(page.locator('.qa-tuin-rij')).toContainText('T1');
});

test('een steen krijgt pas na het tekenen een eigen tabel met fotovak', async ({ page }) => {
  const id = await openKaart(page);
  await expect(page.locator('.qa-stenen')).toHaveCount(0);
  await expect(page.locator('.qa-gereedschap-steen .bi-bricks')).toHaveCount(1);
  await gereedschap(page, 'steen');
  for (const [x, y] of VIERKANT) await tik(page, x, y);
  await page.locator('.qa-klaar').click();
  await sluitTekenaar(page);

  expect((await kaart(page, id)).map((a) => [a.type, a.p.length])).toEqual([['steen', 4]]);
  const rij = page.locator('.qa-steen-rij');
  await expect(rij).toHaveCount(1);
  await expect(rij).toContainText('S1');
  await expect(page.locator('.qa-stenen .bi-bricks')).toHaveCount(1);
  await rij.locator('.qa-fotoslot-steen .qa-foto-invoer').setInputFiles({ name: 'steen.png', mimeType: 'image/png', buffer: PNG });
  await expect(rij.locator('.qa-foto')).toHaveCount(1);
  await opslagKlaar(page);
  expect((await serverDossier(page, id)).fotos.map((f) => f.slot)).toEqual(['kaart', `steen.${(await kaart(page, id))[0].id}`]);
});

test('met een vlakgereedschap kiest een eerste tik binnen een bestaand vlak dat vlak', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'dak');
  for (const [x, y] of VIERKANT) await tik(page, x, y);
  await page.locator('.qa-klaar').click();
  await tekenaarOpgeslagen(page);

  await gereedschap(page, 'tuin');
  await tik(page, 0.5, 0.5);
  await expect(page.locator('.qa-gereedschap-kies')).toHaveClass(/active/);
  await expect(page.locator('.qa-verwijder')).toBeVisible();
  await expect(page.locator('.qa-klaar')).toHaveCount(0);

  // Once a corner is placed, a tap inside the dak is just the next corner.
  await gereedschap(page, 'tuin');
  await tik(page, 0.2, 0.2);
  await tik(page, 0.5, 0.5);
  await tik(page, 0.2, 0.5);
  await page.locator('.qa-klaar').click();
  await sluitTekenaar(page);
  expect((await kaart(page, id)).map((a) => [a.type, a.p.length])).toEqual([['dak', 4], ['tuin', 3]]);
});

test('Escape gooit een half getekend dak weg zonder iets op te slaan', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'dak');
  await tik(page, 0.2, 0.2);
  await tik(page, 0.3, 0.2);
  await page.keyboard.press('Escape');
  for (const [x, y] of VIERKANT.slice(0, 3)) await tik(page, x, y);
  await page.locator('.qa-klaar').click();
  await sluitTekenaar(page);

  const annots = await kaart(page, id);
  expect(annots).toHaveLength(1);
  expect(annots[0].p).toHaveLength(3);
});

test('slepen met een plaatsend gereedschap schuift de kaart en zet niets neer', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'regenpijp');
  const box = (await page.locator('.qa-tekenvlak').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 + 30, { steps: 5 });
  await page.mouse.up();
  await tik(page, 0.5, 0.5);
  await sluitTekenaar(page);
  expect((await kaart(page, id)).map((a) => a.type)).toEqual(['regenpijp']);
});

test('een regenpijp hoort automatisch bij het dichtstbijzijnde dak', async ({ page }) => {
  await openKaart(page);
  await gereedschap(page, 'dak');
  for (const [x, y] of [[0.1, 0.4], [0.3, 0.4], [0.3, 0.6]] as const) await tik(page, x, y);
  await page.locator('.qa-klaar').click();
  for (const [x, y] of [[0.6, 0.4], [0.8, 0.4], [0.8, 0.6]] as const) await tik(page, x, y);
  await page.locator('.qa-klaar').click();
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.85, 0.5);
  await sluitTekenaar(page);

  const rijen = page.locator('.qa-dak-rij');
  await expect(rijen).toHaveCount(2);
  await expect(rijen.nth(0)).toContainText('D1');
  await expect(rijen.nth(0).locator('.qa-verdeling-knop')).toContainText('geen regenpijp');
  await expect(rijen.nth(1)).toContainText('D2');
  await expect(rijen.nth(1).locator('.qa-verdeling-tekst')).toHaveText('A');
});

test('een regenpijp bijzetten zet een met de hand verdeeld dak terug op automatisch met een melding, en ongedaan maken brengt de verdeling terug', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'dak');
  for (const [x, y] of [...VIERKANT, VIERKANT[0]]) await tik(page, x, y);
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.4, 0.5);
  await tik(page, 0.6, 0.5);
  await sluitTekenaar(page);
  const [dak, a, b] = (await kaart(page, id)).map((x) => x.id);
  const knop = page.locator('.qa-verdeling-knop');
  await expect(knop).toHaveText(/^A \d+% · B \d+%$/);
  const uitsnede = page.locator('.qa-regenpijp').first().locator('.qa-bronnen-uitsnede');
  const [, , b1, h1] = (await uitsnede.locator('svg').getAttribute('viewBox'))!.split(' ').map(Number);
  expect(b1).toBe(h1);
  expect(b1).toBeLessThan(400);
  await expect(uitsnede.locator('polygon')).toHaveCount(1);
  await knop.click();
  await page.locator('.qa-verdeling-pct').first().fill('70');
  await page.locator('.qa-verdeling-pct').first().blur();
  await expect(knop).toHaveText('A 70% · B 30%');
  await opslagKlaar(page);

  await openTekenaar(page, 'kaart');
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.5, 0.6);
  await expect(page.locator('.qa-melding-success')).toContainText('Verdeling van D1 opnieuw berekend.');
  await expect(page.locator('.qa-melding-success')).toHaveClass(/melding-weg/, { timeout: 4000 });
  await expect(page.locator('.qa-melding-success')).toHaveCount(0, { timeout: 1000 });
  await tekenaarOpgeslagen(page);
  expect((await serverDossier(page, id)).data).not.toHaveProperty([`dak.${dak}.verdeling`]);

  await page.keyboard.press('Control+z');
  await tekenaarOpgeslagen(page);
  expect((await serverDossier(page, id)).data[`dak.${dak}.verdeling`]).toEqual({ [a]: 70, [b]: 30 });
  await sluitTekenaar(page);
  await expect(knop).toHaveText('A 70% · B 30%');
});

test('de gum staat er pas als er iets gekozen is, en in kiesmodus wordt de muis een handje boven een tekening', async ({ page }) => {
  await openKaart(page);
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.5, 0.5);
  const cursor = async (fx: number, fy: number) => {
    await page.mouse.move(...(await schermPunt(page, fx, fy)));
    return page.locator('.qa-tekenvlak').evaluate((el) => getComputedStyle(el).cursor);
  };
  expect(await cursor(0.5, 0.5)).toBe('auto');

  await gereedschap(page, 'kies');
  await expect(page.locator('.qa-verwijder')).toHaveCount(0);
  expect(await cursor(0.5, 0.5)).toBe('pointer');
  expect(await cursor(0.2, 0.2)).toBe('auto');

  await tik(page, 0.5, 0.5);
  await expect(page.locator('.qa-verwijder')).toBeVisible();
  await tik(page, 0.2, 0.2);
  await expect(page.locator('.qa-verwijder')).toHaveCount(0);
});

test('een regenpijp met ingevulde gegevens verwijderen vraagt bevestiging, en ongedaan maken brengt alles terug', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.5, 0.5);
  await sluitTekenaar(page);
  const pijpId = (await kaart(page, id))[0].id;
  await page.locator('.qa-regenpijp .qa-veld-regenpijp-waar .qa-invoer').fill('Naar de border');
  await opslagKlaar(page);

  await openTekenaar(page, 'kaart');
  await tik(page, 0.5, 0.5);
  await expect(page.locator('.qa-verwijder')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.locator('.qa-bevestig')).toContainText('Regenpijp A verwijderen?');
  await page.locator('.qa-bevestig .qa-nee').click();
  await tekenaarOpgeslagen(page);
  expect(await kaart(page, id)).toHaveLength(1);

  await page.locator('.qa-verwijder').click();
  await ja(page);
  await tekenaarOpgeslagen(page);
  let d = await serverDossier(page, id);
  expect(d.data).not.toHaveProperty('kaart_annotaties');
  expect(d.data).not.toHaveProperty([`regenpijp.${pijpId}.waar`]);

  await page.keyboard.press('Control+z');
  await tekenaarOpgeslagen(page);
  d = await serverDossier(page, id);
  expect((d.data.kaart_annotaties as Annotatie[]).map((a) => a.id)).toEqual([pijpId]);
  expect(d.data[`regenpijp.${pijpId}.waar`]).toBe('Naar de border');
  await expect(page.locator('.qa-ongedaan')).toBeDisabled();
  // Our own ↶ icon: the SVG mask must load, or the button shows a filled square.
  const icoon = page.locator('.qa-ongedaan .icoon-ongedaan');
  await expect(icoon).toBeVisible();
  expect(await icoon.evaluate((el) => getComputedStyle(el).maskImage)).toContain('svg');

  await sluitTekenaar(page);
  await expect(page.locator('.qa-regenpijp .qa-veld-regenpijp-waar .qa-invoer')).toHaveValue('Naar de border');
});

test('een lege regenpijp verwijderen vraagt niets, en de volgende schuiven een letter op met hun gegevens', async ({ page }) => {
  const id = await openKaart(page);
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.3, 0.5);
  await tik(page, 0.5, 0.5);
  await tik(page, 0.7, 0.5);
  await sluitTekenaar(page);
  const pijpen = page.locator('.qa-regenpijp');
  await expect(pijpen.locator('.qa-regenpijp-titel')).toHaveText(['Regenpijp A', 'Regenpijp B', 'Regenpijp C']);
  await pijpen.nth(2).locator('.qa-veld-regenpijp-waar .qa-invoer').fill('Wadi achterin');
  await opslagKlaar(page);

  await openTekenaar(page, 'kaart');
  await tik(page, 0.5, 0.5);
  await page.locator('.qa-verwijder').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await sluitTekenaar(page);

  await expect(pijpen.locator('.qa-regenpijp-titel')).toHaveText(['Regenpijp A', 'Regenpijp B']);
  await expect(pijpen.nth(1).locator('.qa-veld-regenpijp-waar .qa-invoer')).toHaveValue('Wadi achterin');
  expect(await kaart(page, id)).toHaveLength(2);
});

test('op een gewone foto zijn alleen pijl en tekst te tekenen, en een lege tekst wordt niet geplaatst', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.locator('.qa-foto-invoer').setInputFiles({ name: 'tuin.png', mimeType: 'image/png', buffer: PNG });
  await openTekenaar(page, 'tuinsituatie');

  await expect(page.locator('.qa-gereedschap-pijl .bi-arrow-up-right')).toBeVisible();
  await expect(page.locator('.qa-gereedschap-tekst')).toHaveText('T');
  await expect(page.locator('.qa-tekenaar [aria-label="Inzoomen"], .qa-tekenaar [aria-label="Uitzoomen"]')).toHaveCount(0);
  for (const g of ['dak', 'tuin', 'regenpijp']) await expect(page.locator(`.qa-gereedschap-${g}`)).toHaveCount(0);

  await gereedschap(page, 'tekst');
  await tik(page, 0.3, 0.3);
  await page.locator('.qa-tekst-invoer').fill('   ');
  await page.locator('.qa-tekst-ok').click();
  await tik(page, 0.5, 0.5);
  await page.locator('.qa-tekst-invoer').fill('Put');
  await page.locator('.qa-tekst-invoer').press('Enter');
  await sluitTekenaar(page);

  const foto = (await serverDossier(page, id)).fotos.find((f) => f.slot === 'tuinsituatie')!;
  expect(foto.annotaties.map((a) => [a.type, a.tekst])).toEqual([['tekst', 'Put']]);
});

test('Vrij tekenen staat voor de pijl, tekent een rode lijn, en die lijn is te kiezen, te verslepen en via een hoek te schalen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  await page.locator('.qa-fotoslot-tuinsituatie .qa-foto-invoer').setInputFiles({ name: 'tuin.png', mimeType: 'image/png', buffer: PNG });
  await openTekenaar(page, 'tuinsituatie');
  const knoppen = await page.locator('.qa-tekenaar .tools button').evaluateAll((bs) => bs.map((b) => /qa-gereedschap-(\w+)/.exec(b.className)?.[1]).filter(Boolean));
  expect(knoppen).toEqual(['kies', 'schets', 'pijl', 'tekst']);
  await expect(page.locator('.qa-gereedschap-schets .bi-brush')).toBeVisible();

  const sleep = async (punten: [number, number][]) => {
    await page.mouse.move(...(await schermPunt(page, ...punten[0])));
    await page.mouse.down();
    for (const q of punten.slice(1)) await page.mouse.move(...(await schermPunt(page, ...q)), { steps: 5 });
    await page.mouse.up();
  };
  const schets = async () => {
    await tekenaarOpgeslagen(page);
    const annots = (await serverDossier(page, id)).fotos.find((f) => f.slot === 'tuinsituatie')!.annotaties;
    expect(annots.map((a) => a.type)).toEqual(['schets']);
    const xs = annots[0].p.map((q) => q[0]);
    const ys = annots[0].p.map((q) => q[1]);
    return { n: xs.length, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };

  await gereedschap(page, 'schets');
  await sleep([[0.2, 0.5], [0.3, 0.4], [0.4, 0.5], [0.5, 0.4]]);
  await tik(page, 0.8, 0.8); // a tap with the brush draws nothing
  const getekend = await schets();
  expect(getekend.n).toBeGreaterThan(4);
  expect(getekend.x0).toBeCloseTo(80, -1);
  expect(getekend.x1).toBeCloseTo(200, -1);
  await expect(page.locator('.qa-tekenaar-svg path[stroke="#ff0000"]')).toHaveCount(1);

  await gereedschap(page, 'kies');
  await tik(page, 0.3, 0.4);
  await expect(page.locator('.qa-verwijder')).toBeVisible();
  await sleep([[0.3, 0.4], [0.4, 0.6]]);
  const versleept = await schets();
  expect(versleept.x0 - getekend.x0).toBeCloseTo(40, 0);
  expect(versleept.y0 - getekend.y0).toBeCloseTo(60, 0);

  // Dragging the bottom-right corner scales towards the top-left one, which stays put.
  const b = versleept;
  await sleep([[b.x1 / 400, b.y1 / 300], [(b.x0 + 2 * (b.x1 - b.x0)) / 400, (b.y0 + 2 * (b.y1 - b.y0)) / 300]]);
  const geschaald = await schets();
  expect(geschaald.x0).toBeCloseTo(b.x0, 0);
  expect(geschaald.y0).toBeCloseTo(b.y0, 0);
  expect((geschaald.x1 - geschaald.x0) / (b.x1 - b.x0)).toBeCloseTo(2, 1);
  expect((geschaald.y1 - geschaald.y0) / (b.y1 - b.y0)).toBeCloseTo(2, 1);
  await sluitTekenaar(page);
});

test('een foto op de dossierpagina opent als duimpje in de tekenaar, en wat je tekent wordt opgeslagen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.locator('.qa-fotoslot-straatfoto .qa-foto-invoer').setInputFiles({ name: 'straat.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.qa-fotoslot-straatfoto .qa-foto')).toHaveCount(1);
  await page.goto(`/dossiers/${id}`);
  await openTekenaar(page, 'straatfoto', page.locator('.qa-sv-straatfoto .qa-duimen .qa-foto'));
  await gereedschap(page, 'tekst');
  await tik(page, 0.5, 0.5);
  await page.locator('.qa-tekst-invoer').fill('Voordeur');
  await page.locator('.qa-tekst-invoer').press('Enter');
  await tekenaarOpgeslagen(page);
  await sluitTekenaar(page);

  const foto = (await serverDossier(page, id)).fotos.find((f) => f.slot === 'straatfoto')!;
  expect(foto.annotaties.map((a) => [a.type, a.tekst])).toEqual([['tekst', 'Voordeur']]);
});

test('Foto draaien zet een foto en de kaart een kwartslag naar links op dezelfde plek, met de tekeningen mee', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.locator('.qa-foto-invoer').setInputFiles(['a', 'b'].map((n) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await expect(slot.locator('.qa-foto')).toHaveCount(2);
  await openTekenaar(page, 'tuinsituatie');
  await gereedschap(page, 'tekst');
  await tik(page, 0.25, 0.5);
  await page.locator('.qa-tekst-invoer').fill('Put');
  await page.locator('.qa-tekst-invoer').press('Enter');
  await tekenaarOpgeslagen(page);

  // With the drawing tools, before the separator that sets off undo and delete.
  await expect(page.locator('.qa-tekenaar .tools .qa-foto-draaien + .vr')).toBeVisible();
  await page.locator('.qa-foto-draaien').click();
  await expect(page.locator('.qa-tekenaar-svg image')).toHaveAttribute('width', '300');
  await expect(page.locator('.qa-tekenaar-svg image')).toHaveAttribute('height', '400');
  await expect(page.locator('.qa-ongedaan')).toBeDisabled();
  await expect(page.locator('.qa-melding-danger')).toHaveCount(0);
  await sluitTekenaar(page);

  const fotos = ((await serverDossier(page, id)).fotos as unknown as { slot: string; breedte: number; hoogte: number; annotaties: Annotatie[] }[]).filter((f) => f.slot === 'tuinsituatie');
  expect(fotos.map((f) => [f.breedte, f.hoogte])).toEqual([[300, 400], [400, 300]]);
  const [x, y] = fotos[0].annotaties[0].p[0];
  expect(x).toBeCloseTo(150, -1);
  expect(y).toBeCloseTo(300, -1);

  await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: PNG });
  await openTekenaar(page, 'kaart');
  await gereedschap(page, 'regenpijp');
  await tik(page, 0.25, 0.5);
  await tekenaarOpgeslagen(page);
  await page.locator('.qa-foto-draaien').click();
  await expect(page.locator('.qa-tekenaar-svg image')).toHaveAttribute('width', '300');
  await sluitTekenaar(page);
  const [pijp] = await kaart(page, id);
  expect(pijp.p[0][0]).toBeCloseTo(150, -1);
  expect(pijp.p[0][1]).toBeCloseTo(300, -1);
  await expect(page.locator('.qa-regenpijp .qa-regenpijp-titel')).toHaveText(['Regenpijp A']);
});

test.describe('op een touchscreen', () => {
  test.use({ hasTouch: true });

  test('een tik met Tekst opent het tekstvak, dat open blijft tot je OK tikt', async ({ page }) => {
    await start(page);
    const id = await nieuwDossier(page, { huurKoop: 'koop' });
    await page.goto(`/dossiers/${id}/bezoek`);
    await page.locator('.qa-fotoslot-tuinsituatie .qa-foto-invoer').setInputFiles({ name: 'tuin.png', mimeType: 'image/png', buffer: PNG });
    await openTekenaar(page, 'tuinsituatie');
    await gereedschap(page, 'tekst');
    await tik(page, 0.5, 0.5, true);
    await page.waitForTimeout(300);
    await expect(page.locator('.qa-tekst-invoer')).toBeVisible();
    await page.locator('.qa-tekst-invoer').fill('Put');
    await page.locator('.qa-tekst-ok').tap();
    await sluitTekenaar(page);
    const foto = (await serverDossier(page, id)).fotos.find((f) => f.slot === 'tuinsituatie')!;
    expect(foto.annotaties.map((a) => [a.type, a.tekst])).toEqual([['tekst', 'Put']]);
  });
});

test('de derde foto uit een vak verwijderen sluit de tekenaar zonder foutmelding', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  const slot = page.locator('.qa-fotoslot-tuinsituatie');
  await slot.locator('.qa-foto-invoer').setInputFiles(['a', 'b', 'c'].map((n) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await expect(slot.locator('.qa-foto')).toHaveCount(3);
  await openTekenaar(page, 'tuinsituatie', slot.locator('.qa-foto').nth(2));
  await page.locator('.qa-foto-verwijderen').click();
  await ja(page);
  await expect(page.locator('.qa-tekenaar')).toHaveCount(0);
  await expect(slot.locator('.qa-foto')).toHaveCount(2);
  await expect(page.locator('.qa-melding-danger')).toHaveCount(0);
  expect((await serverDossier(page, id)).fotos).toHaveLength(2);
});
