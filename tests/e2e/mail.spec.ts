// The mail pop-up: "Handmatig verstuurd" sends nothing, so it must not be one mis-tap away from Versturen; the prefilled addresses.
import { expect, test } from '@playwright/test';
import { BEHEERDER, emails, nieuwDossier, start, tikAan, verstuurMail } from './hulp.ts';

test('Handmatig verstuurd vraagt eerst bevestiging; annuleren markeert niets, bevestigen markeert zonder te mailen', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  const voor = (await emails(page)).length;
  await page.locator('.qa-mail-subsidie_huur').click();
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();
  await expect(modal.locator('.qa-mail-cc')).toHaveCount(0);

  await modal.locator('.qa-mail-handmatig').click();
  await page.locator('.qa-bevestig .qa-nee').click();
  await expect(page.locator('.qa-bevestig')).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(page.locator('.qa-subsidie-verstuurd')).toHaveCount(0);

  await modal.locator('.qa-mail-handmatig').click();
  await page.locator('.qa-bevestig .qa-ja').click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.qa-subsidie-verstuurd')).toBeVisible();
  expect((await emails(page)).length).toBe(voor);
});

test('na de subsidiemail wordt de knop een link Opnieuw mailen met dezelfde variant', async ({ page }) => {
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  const knop = page.locator('.qa-mail-subsidie_huur');
  await expect(knop).toHaveText('📧 Mail bewoner: subsidiabel, huurwoning');
  await expect(knop).toHaveClass(/btn-outline-primary/);
  await knop.click();
  await page.locator('.qa-mail .qa-mail-versturen').click();
  await expect(page.locator('.qa-subsidie-verstuurd')).toBeVisible();
  await expect(knop).toHaveText('Opnieuw mailen: subsidiabel, huurwoning');
  await expect(knop).toHaveClass(/btn-link/);
  await expect(knop).not.toHaveClass(/btn-outline-primary/);
  await knop.click();
  await expect(page.locator('.qa-mail .qa-mail-aan')).toBeVisible();
});

test('Handmatig verstuurd staat onder Versturen, en de pop-up ligt boven de opslag-indicator', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await start(page);
  await nieuwDossier(page, { huurKoop: 'huur' });
  await page.locator('.qa-mail-subsidie_huur').click();
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toBeVisible();
  const versturen = (await modal.locator('.qa-mail-versturen').boundingBox())!;
  const handmatig = (await modal.locator('.qa-mail-handmatig').boundingBox())!;
  expect(handmatig.y).toBeGreaterThanOrEqual(versturen.y + versturen.height);

  const opslag = (await page.locator('.opslag').boundingBox())!;
  const bovenste = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)!.closest('.opslag, .qa-mail')!.className, [opslag.x + opslag.width / 2, opslag.y + opslag.height / 2]);
  expect(bovenste).toContain('qa-mail');
});

test('de adressen van Beheer > Woningcorporaties staan al ingevuld in de mail aan die woningcorporatie, en de pop-up zegt waar antwoorden heen gaan', async ({ page }) => {
  const { klusserId } = await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-beheer').click();
  await page.locator('.qa-nav-woningcorporaties').click();
  const ieder1 = page.locator('.qa-corporatie-Ieder1');
  const opslaan = async (veld: string, waarde: string) => {
    await ieder1.locator(veld).fill(waarde);
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'PUT' && r.ok()), ieder1.locator(veld).press('Tab')]);
  };
  await opslaan('.qa-corporatie-aan', 'woningen@ieder1.example.org');
  await expect(page.locator('.qa-melding-success').last()).toContainText('Ieder1 opgeslagen');
  await opslaan('.qa-corporatie-cc', 'wijk@ieder1.example.org');
  await page.reload();
  await expect(ieder1.locator('.qa-corporatie-aan')).toHaveValue('woningen@ieder1.example.org');
  await expect(ieder1.locator('.qa-corporatie-cc')).toHaveValue('wijk@ieder1.example.org');

  const id = await nieuwDossier(page, { huurKoop: 'huur', corporatie: 'Ieder1' });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond', 'klaar_voor_controle'], klusserId);
  await page.goto(`/dossiers/${id}`);
  await page.locator('.qa-mail-plan_corporatie').click();
  const modal = page.locator('.qa-mail');
  await expect(modal.locator('.qa-mail-aan')).toHaveValue('woningen@ieder1.example.org');
  await expect(modal.locator('.qa-mail-cc')).toHaveValue('wijk@ieder1.example.org');
  await expect(modal.locator('.qa-mail-kopie')).toContainText('Antwoorden gaan naar jou.');
  await verstuurMail(page);
  expect((await emails(page)).at(-1)).toMatchObject({ aan: 'woningen@ieder1.example.org', cc: `${BEHEERDER.email}, wijk@ieder1.example.org` });
});
