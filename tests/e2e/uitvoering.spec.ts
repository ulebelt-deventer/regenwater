// The Uitvoering page: the uitvoerder confirms per regenpijp whether it was afgekoppeld before Werk opgeleverd, with the kaart to look up which is which; a koopwoning shows the agreed Klussendienst amount.
import { type Page, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { ja, kies, nieuwDossier, opslagKlaar, post, start, tikAan, zet } from './hulp.ts';

async function opUitvoering(page: Page, huurKoop: 'huur' | 'koop', metKaart = false): Promise<number> {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop });
  if (metKaart) {
    await page.goto(`/dossiers/${id}/bezoek`);
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#e8e8e8' } }).png().toBuffer();
    await page.locator('.qa-fotoslot-kaart .qa-foto-invoer').setInputFiles({ name: 'kaart.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.qa-fotoslot-kaart .qa-foto')).toHaveCount(1);
  }
  await zet(page, id, {
    kaart_annotaties: [{ id: 'a', type: 'regenpijp', p: [[1, 1]] }, { id: 'b', type: 'regenpijp', p: [[2, 2]] }],
    'regenpijp.a.afkoppelen': 'ja',
    'regenpijp.b.afkoppelen': 'nee',
  });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond', 'klaar_voor_controle', huurKoop === 'huur' ? 'corporatie_akkoord' : 'klussendienst_gekozen'], klusserId);
  await zet(page, id, { klussendienst_kosten: 12550 });
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: klusserId });
  await page.goto(`/dossiers/${id}/uitvoering`);
  return id;
}

test('Werk opgeleverd vraagt eerst per af te koppelen regenpijp of hij is afgekoppeld, en de samenvatting toont het antwoord', async ({ page }) => {
  const id = await opUitvoering(page, 'koop');
  await expect(page.locator('.qa-afgekoppeld .qa-veld')).toHaveCount(1);
  await expect(page.locator('.qa-afgekoppeld .qa-veld')).toContainText('Regenpijp A: afgekoppeld?');

  await page.locator('.qa-werk-opgeleverd').click();
  await expect(page.locator('.qa-melding-danger')).toContainText('Vul eerst bij regenpijp A in of hij is afgekoppeld.');
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);

  await kies(page, 'regenpijp-afgekoppeld', 'ja');
  await opslagKlaar(page);
  await page.locator('.qa-werk-opgeleverd').click();
  await ja(page);
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));
  await expect(page.locator('.qa-sectie-uitvoering .qa-sv-afgekoppeld')).toHaveText(/Regenpijp A: Ja$/);
});

test('een koopwoning toont onder de Gebruikte materialen de afgesproken kosten Klussendienst, en Werk opgeleverd staat op een eigen regel', async ({ page }) => {
  await opUitvoering(page, 'koop');
  const kosten = page.locator('.qa-klussendienst-afgesproken');
  const totaal = page.locator('.qa-materiaal-totaal');
  const knop = page.locator('.qa-werk-opgeleverd');
  await expect(kosten).toContainText('€ 125,50');
  await expect(totaal).toBeVisible();
  await expect(knop).toBeVisible();
  const t = (await totaal.boundingBox())!;
  const k = (await kosten.boundingBox())!;
  const b = (await knop.boundingBox())!;
  expect(k.y).toBeGreaterThanOrEqual(t.y + t.height);
  expect(b.y).toBeGreaterThanOrEqual(k.y + k.height);
});

test('een huurwoning noemt de kosten Klussendienst niet op de Uitvoering', async ({ page }) => {
  await opUitvoering(page, 'huur');
  await expect(page.locator('.qa-materiaal-totaal')).toBeVisible();
  await expect(page.locator('.qa-afgekoppeld')).toBeVisible();
  await expect(page.locator('.qa-klussendienst-afgesproken')).toHaveCount(0);
});

test('de kaart opent vanaf de Regenpijpen om te bekijken en te zoomen, zonder tekengereedschap', async ({ page }) => {
  await opUitvoering(page, 'koop', true);
  await page.locator('.qa-afgekoppeld .qa-kaart-bekijken').click();
  const tekenaar = page.locator('.qa-tekenaar');
  await expect(tekenaar.locator('.qa-tekenaar-svg text')).toHaveText(['A', 'B']);
  await expect(tekenaar.locator('.qa-hint')).toContainText('Knijp of scroll om te zoomen');
  // The beheerder may draw on the kaart elsewhere; here it's only for looking.
  await expect(tekenaar.locator('.qa-gereedschap-kies, .qa-gereedschap-regenpijp, .qa-foto-verwijderen')).toHaveCount(0);
  await tekenaar.locator('.qa-tekenaar-sluiten').click();
  await expect(tekenaar).toHaveCount(0);
});

test('zonder kaart staat er geen link naar de kaart bij de Regenpijpen', async ({ page }) => {
  await opUitvoering(page, 'koop');
  await expect(page.locator('.qa-afgekoppeld')).toBeVisible();
  await expect(page.locator('.qa-kaart-bekijken')).toHaveCount(0);
});
