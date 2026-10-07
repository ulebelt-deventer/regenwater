// The eight scenarios from spec.md: one dossier each, walked through the UI, checking status, aandacht and the documents after each action.
import { type Page, expect, test } from '@playwright/test';
import {
  ADRES, BEHEERDER, KLUSSER, afspraak, bezoek, emails, geenAandacht, laatsteDocument, login, mail, naarDossier, nieuwDossier, opslagKlaar,
  plan, planTekst, sluit, sluitModal, start, status, subsidieMail, uitvoering, veld, verschuifDagen, verstuurMail, wijsToe,
} from './hulp.ts';
import { STANDAARD_MATERIALEN } from '../../src/shared/constants.ts';

const PLAN_PDF = 'Plan van Aanpak Walstraat 74 Deventer.pdf';
const OPLEVER_PDF = 'Opleverrapport Walstraat 74 Deventer.pdf';

async function laatsteMail(page: Page) {
  const m = await emails(page);
  return m[m.length - 1];
}

// Intake, bezoeker (Kees), afspraak, bezoek and plan, all by the admin: the dossier ends at step 6.
async function totPlanKlaar(page: Page, klusserId: number, huurKoop: 'huur' | 'koop'): Promise<number> {
  const id = await nieuwDossier(page, { huurKoop });
  await subsidieMail(page, huurKoop);
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await afspraak(page, '2026-03-02', '09:00');
  await bezoek(page, id);
  await plan(page, id);
  await naarDossier(page, id);
  await status(page, 'Plan controleren & versturen');
  return id;
}

test('huur: intake, bezoek, plan, akkoord, uitvoering en opleverrapport tot gesloten als Uitgevoerd', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await expect(page.locator('.qa-intake-ontbreekt')).toContainText('subsidiemail');
  await subsidieMail(page, 'huur');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'bea@example.org', onderwerp: 'Uw aanmelding: we komen graag langs' });

  await naarDossier(page, id);
  await status(page, 'Bezoeker toewijzen');
  await geenAandacht(page);
  await wijsToe(page, 'bezoeker', klusserId, true);
  expect(await laatsteMail(page)).toMatchObject({ aan: KLUSSER.email, onderwerp: `Nieuw adres voor je: ${ADRES}` });
  await status(page, 'Bezoek plannen');

  await afspraak(page, '2026-03-02', '09:00');
  await status(page, 'Bezoek uitvoeren');
  await bezoek(page, id);
  await naarDossier(page, id);
  await status(page, 'Plan van Aanpak afronden');

  await page.goto(`/dossiers/${id}/plan`);
  const rijen = page.locator('.qa-materialen-materialen .qa-materiaal-rij');
  await expect(rijen).toHaveCount(STANDAARD_MATERIALEN.length);
  await expect(rijen.first().locator('.qa-materiaal-naam')).toHaveValue('Regenton 210 liter');
  await expect(rijen.first().locator('.qa-materiaal-prijs')).toHaveValue('45');
  await plan(page, id);
  await expect(page.locator('.qa-materiaal-totaal')).toContainText('€ 90,00');

  await naarDossier(page, id);
  await status(page, 'Plan controleren & versturen');
  await geenAandacht(page);
  await mail(page, 'plan_bewoner_huur');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'bea@example.org', bijlagen: [PLAN_PDF] });
  await status(page, 'Plan controleren & versturen');
  await mail(page, 'plan_corporatie');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'regenwater@ieder1.nl', onderwerp: `Verzoek toestemming afkoppeling ${ADRES}`, bijlagen: [PLAN_PDF] });
  const pdf = await laatsteDocument(page);
  expect(pdf).toContain('Plan van Aanpak regenwater');
  expect(pdf).toContain('Bewoner: Bea Bewoner');
  expect(pdf).toContain('Woningeigenaar: Ieder1');
  expect(pdf).toContain(`Schouw door: ${KLUSSER.naam}`);
  expect(pdf).toContain(`Auteur: ${BEHEERDER.naam}`);
  expect(pdf).toContain('Regenton plaatsen bij pijp A');
  expect(pdf).toContain('Regenton 210 liter');
  expect(pdf).not.toContain('Regentonstandaard');
  await status(page, 'Plan goedkeuren (huur)');
  await expect(page.locator('.qa-sectie-versturen .qa-verstuurd')).toHaveCount(2);

  await page.locator('.qa-akkoord').click();
  await expect(page.locator('.qa-mijlpaal-corporatie_akkoord')).toBeVisible();
  await status(page, 'Uitvoerder toewijzen');
  await wijsToe(page, 'uitvoerder', klusserId, true);
  expect(await laatsteMail(page)).toMatchObject({ aan: KLUSSER.email, onderwerp: `Uitvoering regenwater: ${ADRES}`, bijlagen: [PLAN_PDF] });
  await status(page, 'Werk uitvoeren');
  await expect(page.locator('.qa-opleverrapport')).toHaveCount(0);
  await expect(page.locator('.qa-mail-oplever_bewoner')).toBeDisabled();

  await page.goto(`/dossiers/${id}/uitvoering`);
  const gebruikt = page.locator('.qa-materialen-gebruikt .qa-materiaal-rij');
  await expect(gebruikt).toHaveCount(1);
  await expect(gebruikt.locator('.qa-materiaal-naam')).toHaveValue('Regenton 210 liter');
  await expect(gebruikt.locator('.qa-materiaal-aantal')).toHaveValue('2');
  await uitvoering(page, id);

  await naarDossier(page, id);
  await status(page, 'Opleverrapport versturen');
  await mail(page, 'oplever_corporatie');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'regenwater@ieder1.nl', bijlagen: [OPLEVER_PDF] });
  const rapport = await laatsteDocument(page);
  expect(rapport).toContain('Opleverrapport regenwater');
  expect(rapport).toContain(`Uitgevoerd door: ${KLUSSER.naam}`);
  expect(rapport).toContain('Opgeleverd op: 2-3-2026');
  expect(rapport).toContain('Regenton geplaatst en pijp afgekoppeld.');
  expect(rapport).toContain('Gebruikte materialen');
  await mail(page, 'oplever_bewoner');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'bea@example.org', bijlagen: [OPLEVER_PDF] });

  await page.locator('.qa-uitgevoerd-sluiten').click();
  await status(page, 'Gesloten: Uitgevoerd');
  await expect(page.locator('.qa-gesloten')).toContainText('Uitgevoerd');
  await geenAandacht(page);

  await page.goto('/dossiers');
  await expect(page.locator('.qa-stat-uitgevoerd')).toHaveText('1');
  await expect(page.locator('.qa-stat-open')).toHaveText('0');
});

test('koop met Klussendienst: nieuwe klusser als uitvoerder, badges in Mijn dossiers, bewerken stopt na overdracht, opleverrapport opnieuw na sluiten', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await subsidieMail(page, 'koop');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, true);
  await afspraak(page, '2026-03-02', '09:00');

  // The bezoeker does the bezoek and the plan.
  await login(page, KLUSSER.email);
  await page.goto('/dossiers');
  await expect(page.locator(`table .qa-dossier-${id} .qa-opdracht`)).toHaveText('Bezoek');
  await expect(page.locator(`table .qa-dossier-${id} .qa-opdracht-aan-zet`)).toHaveCount(1);
  await bezoek(page, id);
  await plan(page, id);
  expect(await laatsteMail(page)).toMatchObject({ aan: 'regenwater@ulebelt.nl' });
  await page.reload();
  await expect(page.locator('.qa-klaar-voor-controle')).toHaveCount(0);
  await expect(veld(page, 'beoordeling').locator('.qa-optie-uitvoerbaar')).toBeDisabled();
  await expect(page.locator('.qa-voorstel-toevoegen')).toHaveCount(0);
  await naarDossier(page, id);
  await expect(page.locator('.qa-naar-plan')).toHaveText('Bekijken');
  await expect(veld(page, 'afspraak').locator('.qa-datum')).toBeDisabled();

  await login(page, BEHEERDER.email);
  await naarDossier(page, id);
  await status(page, 'Plan controleren & versturen');
  await mail(page, 'plan_bewoner_koop');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'bea@example.org', bijlagen: [PLAN_PDF] });
  const pdf = await laatsteDocument(page);
  expect(pdf).toContain('Woningeigenaar: Bewoner (koopwoning)');
  await status(page, 'Klussendienst of zelf? (koop)');
  await page.locator('.qa-klussendienst').click();
  await status(page, 'Uitvoerder toewijzen');

  // The uitvoerder doesn't have an account yet: created from the dropdown, then assigned and mailed.
  const blok = page.locator('.qa-toewijzen-uitvoerder');
  await blok.locator('.qa-toewijzen-knop').click();
  await blok.locator('.qa-nieuwe-klusser').click();
  const form = page.locator('.qa-gebruiker-form');
  await form.locator('.qa-gebruiker-naam').fill('Piet Uitvoerder');
  await form.locator('.qa-gebruiker-email').fill('piet@ulebelt.test');
  await form.locator('.qa-gebruiker-opslaan').click();
  await verstuurMail(page);
  expect(await laatsteMail(page)).toMatchObject({ aan: 'piet@ulebelt.test', bijlagen: [PLAN_PDF] });
  await expect(blok.locator('.qa-toewijzen-knop')).toContainText('Piet Uitvoerder');
  await status(page, 'Werk uitvoeren');

  await login(page, 'piet@ulebelt.test');
  await page.goto('/dossiers');
  await expect(page.locator(`table .qa-dossier-${id} .qa-opdracht`)).toHaveText('Uitvoering');
  await expect(page.locator(`table .qa-dossier-${id} .qa-opdracht-aan-zet`)).toHaveCount(1);
  await login(page, KLUSSER.email);
  await page.goto('/dossiers');
  const bezoekBadge = page.locator(`table .qa-dossier-${id} .qa-opdracht`);
  await expect(bezoekBadge).toHaveText('✓ Bezoek');
  await expect(bezoekBadge).toHaveClass(/border-secondary/);
  await expect(bezoekBadge).not.toHaveClass(/qa-opdracht-aan-zet/);

  await login(page, 'piet@ulebelt.test');
  await uitvoering(page, id);
  await page.reload();
  await expect(page.locator('.qa-werk-opgeleverd')).toHaveCount(0);
  await expect(veld(page, 'uitgevoerd').locator('.qa-invoer')).toBeDisabled();
  await expect(page.locator('.qa-materialen-gebruikt .qa-materiaal-naam')).toBeDisabled();

  await login(page, BEHEERDER.email);
  await naarDossier(page, id);
  await status(page, 'Opleverrapport versturen');
  await mail(page, 'oplever_bewoner');
  await page.locator('.qa-uitgevoerd-sluiten').click();
  await status(page, 'Gesloten: Uitgevoerd');

  // Closed, yet the bewoner asks for the report again.
  await page.locator('.qa-mail-oplever_bewoner').click();
  await expect(page.locator('.qa-mail-eerder')).toBeVisible();
  await verstuurMail(page);
  const rapporten = (await emails(page)).filter((m) => m.bijlagen.includes(OPLEVER_PDF));
  expect(rapporten).toHaveLength(2);
  expect(rapporten.every((m) => m.aan === 'bea@example.org')).toBe(true);
  expect(await laatsteDocument(page)).toContain('Uitgevoerd door: Piet Uitvoerder');
  await status(page, 'Gesloten: Uitgevoerd');
});

test('koop, bewoner doet het zelf: gesloten na het plan', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await totPlanKlaar(page, klusserId, 'koop');
  await mail(page, 'plan_bewoner_koop');
  await status(page, 'Klussendienst of zelf? (koop)');
  await page.locator('.qa-zelf').click();
  await expect(page.locator('.qa-sluit-modal .qa-reden-bewoner-doet-het-zelf')).toBeChecked();
  await sluitModal(page, null, 'Gaat zelf aan de slag met de tips uit het plan.');
  await status(page, 'Gesloten: Bewoner doet het zelf');
  await expect(page.locator('.qa-gesloten')).toContainText('Gaat zelf aan de slag');
  await expect(page.locator('.qa-sectie-uitvoerder')).toHaveCount(0);
  await geenAandacht(page);
  expect(id).toBeGreaterThan(0);
});

test('niet subsidiabel: gescheiden riool, subsidiemail en gesloten bij de intake', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur', riool: 'gescheiden' });
  // The autodetectie's gemengd stays a hint: the admin's own gescheiden is what counts.
  await expect(page.locator('.qa-riool-auto .qa-riool-auto-gemengd')).toBeVisible();
  await expect(page.locator('.qa-veld-straatfoto')).toHaveCount(0);
  await mail(page, 'subsidie_niet');
  expect(await laatsteMail(page)).toMatchObject({ aan: 'bea@example.org', onderwerp: 'Uw aanmelding bij De Ulebelt' });
  await page.locator('.qa-sluiten-niet-subsidiabel').click();
  await expect(page.locator('.qa-sluit-modal .qa-reden-niet-subsidiabel')).toBeChecked();
  await sluitModal(page, null);
  await expect(page.locator('.qa-gesloten')).toContainText('Niet subsidiabel');
  await naarDossier(page, id);
  await status(page, 'Gesloten: Niet subsidiabel');
  await geenAandacht(page);
});

test('woningcorporatie vraagt wijzigingen: Plan gewijzigd met audit, opnieuw versturen herstart de wachttijd, uitstellen, dan akkoord', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await totPlanKlaar(page, klusserId, 'huur');
  await mail(page, 'plan_corporatie');
  await status(page, 'Plan goedkeuren (huur)');
  await geenAandacht(page);

  await page.goto(`/dossiers/${id}/plan`);
  await page.locator('.qa-voorstel-rij .qa-invoer').first().fill('Regenton en wadi in de achtertuin');
  await opslagKlaar(page);
  await naarDossier(page, id);
  await expect(page.locator('.qa-aandacht')).toContainText('Het plan is gewijzigd op 2 maart 2026, na het versturen naar de woningcorporatie op 2 maart 2026. Stuur het opnieuw, of markeer dat dat niet nodig is.');
  await expect(page.locator('.qa-sectie-versturen .qa-plan-gewijzigd')).toBeVisible();

  await page.locator('.qa-wijzigingen').click();
  await expect(page.locator('.qa-sinds')).toBeVisible();
  const wijziging = page.locator('.qa-type-dossier_gewijzigd .qa-wijzigingen-lijst');
  await expect(wijziging).toContainText('Regenton plaatsen bij pijp A');
  await expect(wijziging).toContainText('→ Regenton en wadi in de achtertuin');

  // 10 days without an answer is not yet Ligt stil.
  await naarDossier(page, id);
  await verschuifDagen(page, 10);
  await expect(page.locator('.qa-aandacht')).not.toContainText('nog niet gereageerd');
  await mail(page, 'plan_corporatie');
  await geenAandacht(page);
  await expect(page.locator('.qa-sectie-versturen .qa-verstuurd')).toContainText('12 maart 2026');
  expect(await laatsteDocument(page)).toContain('Regenton en wadi in de achtertuin');

  // 20 days after the first send but 10 after the resend: still quiet.
  await verschuifDagen(page, 10);
  await status(page, 'Plan goedkeuren (huur)');
  await geenAandacht(page);
  await verschuifDagen(page, 5);
  await expect(page.locator('.qa-aandacht')).toContainText('Ieder1 heeft na 15 dagen nog niet gereageerd op het plan. Tijd om na te bellen?');

  await page.locator('.qa-dossier-menu').click();
  await page.locator('.qa-menu-uitstellen').click();
  await page.locator('.qa-uitstel-tot').fill('2026-04-01');
  await page.locator('.qa-uitstel-notitie').fill('Ieder1 gebeld, reageren na de vergadering');
  await page.locator('.qa-uitstel-modal .qa-actie-ok').click();
  await geenAandacht(page);
  await expect(page.locator('.qa-uitgesteld')).toHaveText('Uitgesteld tot 1 april 2026: Ieder1 gebeld, reageren na de vergadering');
  // Sessions last 30 days and the next shift reaches day 30.
  await login(page, BEHEERDER.email);
  await verschuifDagen(page, 4);
  await geenAandacht(page);
  await verschuifDagen(page, 1);
  await expect(page.locator('.qa-aandacht')).toContainText('Ieder1 heeft na 20 dagen nog niet gereageerd');

  await page.locator('.qa-akkoord').click();
  await status(page, 'Uitvoerder toewijzen');
  await geenAandacht(page);
});

test('woningcorporatie wijst af: gesloten als Plan afgewezen', async ({ page }) => {
  const { klusserId } = await start(page);
  await totPlanKlaar(page, klusserId, 'huur');
  await mail(page, 'plan_corporatie');
  await status(page, 'Plan goedkeuren (huur)');
  await page.locator('.qa-afgewezen').click();
  await expect(page.locator('.qa-sluit-modal .qa-reden-plan-afgewezen')).toBeChecked();
  await sluitModal(page, null, 'Ieder1 wil geen wadi naast de fundering.');
  await status(page, 'Gesloten: Plan afgewezen');
  await expect(page.locator('.qa-akkoord')).toHaveCount(0);
  await expect(page.locator('.qa-mail-plan_corporatie')).toHaveCount(0);
  await geenAandacht(page);
});

test('bewoner haakt af na het bezoek: niets bewerkbaar zolang gesloten, na heropenen verder bij de juiste stap', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await afspraak(page, '2026-03-02', '09:00');
  await bezoek(page, id);
  await naarDossier(page, id);
  await status(page, 'Plan van Aanpak afronden');

  await sluit(page, 'bewoner-afgehaakt', 'Bewoner wil toch geen regenton.');
  await status(page, 'Gesloten: Bewoner afgehaakt');
  await expect(veld(page, 'notities').locator('.qa-invoer')).toBeDisabled();
  await expect(veld(page, 'afspraak').locator('.qa-datum')).toBeDisabled();
  await expect(page.locator('.qa-bezoeker-naam')).toHaveText(KLUSSER.naam);
  await expect(page.locator('.qa-naar-plan')).toHaveText('Bekijken');
  await page.goto(`/dossiers/${id}/plan`);
  await expect(veld(page, 'beoordeling').locator('.qa-optie-uitvoerbaar')).toBeDisabled();
  await expect(page.locator('.qa-klaar-voor-controle')).toHaveCount(0);
  await page.goto(`/dossiers/${id}/intake`);
  await expect(page.locator('.qa-adres-zoek')).toHaveCount(0);
  await expect(veld(page, 'bewoner_naam').locator('.qa-invoer')).toBeDisabled();
  const patch = await page.request.patch(`/api/dossiers/${id}`, { data: { key: 'notities', value: 'Toch iets' } });
  expect(patch.status()).toBe(409);

  await naarDossier(page, id);
  await page.locator('.qa-dossier-menu').click();
  await page.locator('.qa-heropenen').click();
  await status(page, 'Plan van Aanpak afronden');
  await expect(page.locator('.qa-gesloten')).toHaveCount(0);
  await expect(veld(page, 'notities').locator('.qa-invoer')).toBeEnabled();
});

test('papieren bezoek: bezoeker toegewezen zonder mail, PDF met Schouw door en Auteur, plan handmatig verstuurd', async ({ page }) => {
  const { klusserId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur', corporatie: 'Rentree' });
  await subsidieMail(page, 'huur');
  await naarDossier(page, id);
  await wijsToe(page, 'bezoeker', klusserId, false);
  await expect(page.locator('.qa-sectie-bezoeker .qa-verstuurd')).toHaveCount(0);
  await afspraak(page, '2026-02-27', '14:00');
  await status(page, 'Bezoek uitvoeren');
  await bezoek(page, id, 'Overgenomen van het papieren formulier: regenton gewenst.');
  await plan(page, id);
  await naarDossier(page, id);
  await status(page, 'Plan controleren & versturen');

  const pdf = await planTekst(page, id);
  expect(pdf).toContain(`Schouw door: ${KLUSSER.naam}`);
  expect(pdf).toContain(`Auteur: ${BEHEERDER.naam}`);
  expect(pdf).toContain('Datum schouw: 27-2-2026');
  expect(pdf).toContain('Woningeigenaar: Rentree');

  const voor = (await emails(page)).length;
  await mail(page, 'plan_corporatie', true);
  expect(await emails(page)).toHaveLength(voor);
  await expect(page.locator('.qa-sectie-versturen .qa-verstuurd')).toContainText('Handmatig verstuurd op 2 maart 2026');
  await status(page, 'Plan goedkeuren (huur)');
  expect((await emails(page)).some((m) => m.aan === KLUSSER.email)).toBe(false);
  await geenAandacht(page);
});
