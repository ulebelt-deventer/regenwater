// Aandacht findings that the scenarios don't reach, and the one check that the printer produces a real PDF.
import { expect, test } from '@playwright/test';
import { afspraak, bezoek, corporatieMail, geenAandacht, ja, kies, naarDossier, nieuwDossier, opslagKlaar, plan, post, start, status, subsidieMail, verschuifDagen, wijsToe } from './hulp.ts';

test('een afspraak in de toekomst is geen aandachtspunt, drie dagen erna zonder afgerond bezoek wel', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await afspraak(page, '2026-03-03', '10:00');
  await status(page, 'Bezoek uitvoeren');
  await geenAandacht(page);

  await verschuifDagen(page, 4);
  await expect(page.locator('.qa-aandacht')).toContainText('Afspraak was op 3 maart 2026, maar het bezoek is niet afgerond. Doorgegaan?');
  await bezoek(page, id);
  await naarDossier(page, id);
  await geenAandacht(page);
});

test('koopwoning met een goedkeuring van de woningcorporatie: Klopt niet', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await afspraak(page, '2026-03-02', '09:00');
  await bezoek(page, id);
  await plan(page, id);
  await naarDossier(page, id);
  await corporatieMail(page, 'plan_corporatie');
  await page.locator('.qa-akkoord').click();
  await status(page, 'Uitvoerder toewijzen');
  await geenAandacht(page);

  await page.goto(`/dossiers/${id}/inschrijving`);
  await kies(page, 'huur_koop', 'koop');
  await opslagKlaar(page);
  await naarDossier(page, id);
  await expect(page.locator('.qa-aandacht')).toContainText('De gegevens spreken elkaar tegen. Controleer:');
  await expect(page.locator('.qa-aandacht-uitleg')).toHaveAttribute('href', '/uitleg/aandacht');
  await expect(page.locator('.qa-klopt-niet')).toContainText('Koopwoning, maar met goedkeuring van de woningcorporatie. Klopt huur/koop?');
});

test('een beheerder verbergt meldingen met het rode kruisje, en ze blijven weg na herladen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/bezoek`);
  await expect(page.locator('.qa-regenpijpen .qa-geen-regenpijp')).toBeVisible();
  for (const melding of ['.qa-geen-dak', '.qa-geen-regenpijp']) {
    await page.locator(`${melding} .qa-verberg`).click();
    await expect(page.locator(melding)).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator('.qa-veld-wensen')).toBeVisible();
  await expect(page.locator('.qa-regenpijpen > h3')).toBeVisible();
  await expect(page.locator('.qa-geen-dak')).toHaveCount(0);
  await expect(page.locator('.qa-geen-regenpijp')).toHaveCount(0);

  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'werk_opgeleverd' });
  await naarDossier(page, id);
  const regels = page.locator('.qa-klopt-niet .qa-bevinding');
  const aantal = await regels.count();
  expect(aantal).toBeGreaterThan(2);
  await expect(regels.locator('button')).toHaveCount(0);
  const eerste = (await regels.first().locator('.qa-bevinding-link').textContent())!;
  await regels.first().locator('.qa-verberg').click();
  await expect(regels).toHaveCount(aantal - 1);
  await page.reload();
  await expect(regels).toHaveCount(aantal - 1);
  await expect(page.locator('.qa-aandacht')).not.toContainText(eerste);

  await page.locator('.qa-alles-verbergen').click();
  await ja(page);
  await geenAandacht(page);
  await page.reload();
  await expect(page.locator('.qa-status')).toBeVisible();
  await geenAandacht(page);
});

test('een geprinte Plan van Aanpak is een echte PDF', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  const res = await page.request.get(`/docs/dossiers/${id}/plan.pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
