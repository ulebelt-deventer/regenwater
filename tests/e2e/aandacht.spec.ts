// Aandacht findings that the scenarios don't reach, and the one check that the printer produces a real PDF.
import { expect, test } from '@playwright/test';
import { afspraak, bezoek, geenAandacht, kies, mail, naarDossier, nieuwDossier, opslagKlaar, plan, start, status, subsidieMail, verschuifDagen, wijsToe } from './hulp.ts';

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
  await expect(page.locator('.qa-aandacht')).toContainText('De afspraak was op 3 maart 2026, 3 dagen geleden, maar het bezoek is nog niet afgerond. Is het doorgegaan?');
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
  await mail(page, 'plan_corporatie');
  await page.locator('.qa-akkoord').click();
  await status(page, 'Uitvoerder toewijzen');
  await geenAandacht(page);

  await page.goto(`/dossiers/${id}/intake`);
  await kies(page, 'huur_koop', 'koop');
  await opslagKlaar(page);
  await naarDossier(page, id);
  await expect(page.locator('.qa-aandacht')).toContainText('Het systeem kan de status van dit dossier niet goed bepalen. Controleer:');
  await expect(page.locator('.qa-klopt-niet')).toContainText('Dit is een koopwoning, maar er is een goedkeuring van de woningcorporatie geregistreerd. Klopt huur/koop?');
});

test('een geprinte Plan van Aanpak is een echte PDF', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  const res = await page.request.get(`/docs/dossiers/${id}/plan.pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
