// The details page summarises every sub-page field as text, and a done step's Bewerken sits in its section's top right corner.
import { expect, test } from '@playwright/test';
import { nieuwDossier, opslagKlaar, post, start, subsidieMail, veld, wijsToe, zet } from './hulp.ts';

test('de samenvattingen tonen alle ingevulde velden van inschrijving, bezoek, plan en uitvoering', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'huur', corporatie: 'Ieder1' });
  await zet(page, id, {
    bewoner_telefoon: '0612345678',
    boorlocatie: 'Voorbeeldplein, Deventer',
    bodemsituatie: 'klei',
    kaart_annotaties: [
      { id: 'd1', type: 'dak', p: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 't1', type: 'tuin', p: [[20, 0], [30, 0], [30, 10], [20, 10]] },
      { id: 'r1', type: 'regenpijp', p: [[1, 1]] },
    ],
    'dak.d1.m2': 24,
    'tuin.t1.m2': 30,
    tuinsituatie: 'Groot gazon achter',
    'regenpijp.r1.soort': 'pvc',
    'regenpijp.r1.diameter': '80',
    'regenpijp.r1.regenton': 'gewenst',
    'regenpijp.r1.ondergrond': 'Tegels',
    'regenpijp.r1.afkoppelen': 'ja',
    'regenpijp.r1.waar': 'De border in',
    'regenpijp.r1.hoe': ['holie_molie'],
    hoosbuien: 'Plas op het terras',
    wensen: 'Regenton bij de schuur',
    beoordeling: 'uitvoerbaar',
    beoordeling_toelichting: 'Prima te doen',
    bewoner_doet: ['opruimen'],
    bewoner_doet_details: 'Voor 1 mei',
    ulebelt_doet: ['materialen'],
    materialen: ['m1', 'm2'],
    'materiaal.m1.naam': 'Regenton 210 liter',
    'materiaal.m1.prijs': 4500,
    'materiaal.m1.aantal': 2,
    'materiaal.m2.naam': 'Klikmof',
    'materiaal.m2.aantal': 0,
    werkzaamheden: 'Regenton aansluiten',
    uitgevoerd: 'Regenton geplaatst',
  });
  // The Uitvoering section only shows once the plan is approved.
  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'corporatie_akkoord', aan: true });
  await page.goto(`/dossiers/${id}`);

  const inschrijving = page.locator('.qa-sectie-inschrijving');
  await expect(inschrijving).toContainText('Huurwoning, Ieder1, Tussenwoning');
  await expect(inschrijving.locator('.qa-sv-bewoner')).toHaveText(/^\s*Bewoner\s*Bea Bewoner\s*• 0612345678\s*• bea@example.org\s*$/);
  await expect(inschrijving.locator('.qa-subsidie-niet-verstuurd')).toHaveClass(/text-warning/);
  await expect(inschrijving.locator('.qa-sv-rioolstelsel')).toContainText('Gemengd');
  await expect(inschrijving.locator('.qa-sv-straatfoto')).toContainText('--');
  await expect(inschrijving.locator('.qa-sv-boorlocatie')).toContainText('Voorbeeldplein, Deventer');
  await expect(inschrijving.locator('.qa-sv-bodemsituatie')).toContainText('Klei (slecht doorlaatbaar)');

  const bezoek = page.locator('.qa-sectie-bezoek');
  await expect(bezoek.locator('.qa-sv-dak')).toHaveText(/Dak D1\s*24 m² · regenpijp A$/);
  await expect(bezoek.locator('.qa-sv-tuin')).toContainText('30 m²');
  await expect(bezoek.locator('.qa-sv-tuinsituatie')).toContainText('Groot gazon achter');
  const pijp = bezoek.locator('.qa-sv-regenpijp');
  await expect(pijp).toContainText('van D1 · 480 liter waterberging · PVC · 80 mm · Regenton: Niet aanwezig, wel gewenst · Afkoppelen: Ja');
  await expect(pijp).toContainText('Ondergrond: Tegels');
  await expect(pijp).toContainText('Water naar: De border in');
  await expect(pijp).toContainText('Via: Holie Molie');
  await expect(bezoek.locator('.qa-sv-hoosbuien')).toContainText('Plas op het terras');
  await expect(bezoek.locator('.qa-sv-wensen')).toContainText('Regenton bij de schuur');
  await expect(bezoek.locator('.qa-sv-bewoner_doet')).toContainText('Tuin opruimen op plek regenton');
  await expect(bezoek.locator('.qa-sv-bewoner_doet_details')).toContainText('Voor 1 mei');
  await expect(bezoek.locator('.qa-sv-ulebelt_doet')).toContainText('Materialen regelen');
  await expect(bezoek.locator('.qa-sv-ulebelt_doet_details')).toContainText('--');

  const plan = page.locator('.qa-sectie-plan');
  await expect(plan.locator('.qa-sv-beoordeling')).toContainText('Wensen uitvoerbaar');
  await expect(plan.locator('.qa-sv-beoordeling_toelichting')).toContainText('Prima te doen');
  const materialen = plan.locator('.qa-sv-materialen');
  await expect(materialen).toContainText('2 × Regenton 210 liter à € 45,00');
  await expect(materialen).toContainText('Totaal € 90,00 (geschat)');
  await expect(materialen).not.toContainText('Klikmof');
  await expect(plan.locator('.qa-sv-werkzaamheden')).toContainText('Regenton aansluiten');

  const uitvoering = page.locator('.qa-sectie-uitvoering');
  await expect(uitvoering.locator('.qa-sv-uitgevoerd')).toContainText('Regenton geplaatst');
  await expect(uitvoering.locator('.qa-sv-opleverfotos')).toContainText('--');
});

test('bij een gescheiden riool zegt de inschrijving waarom straatfoto, kaart en boorprofiel ontbreken', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop', riool: 'gescheiden' });
  await expect(page.locator('.qa-niet-subsidiabel-uitleg')).toContainText('gescheiden riool');
  await expect(page.locator('.qa-veld-straatfoto')).toHaveCount(0);
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-sectie-inschrijving .qa-sv-niet-subsidiabel')).toBeVisible();
  await expect(page.locator('.qa-sectie-inschrijving .qa-sv-straatfoto')).toHaveCount(0);
});

test('in het actiemenu staat Dossier sluiten in amber onder de streep, vlak boven Verwijderen', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  await page.locator('.qa-dossier-menu').click();
  const sluiten = page.locator('.qa-menu-sluiten');
  await expect(sluiten).toHaveClass(/text-warning/);
  await expect(sluiten.locator('xpath=preceding-sibling::*[1]')).toHaveClass(/dropdown-divider/);
  await expect(sluiten.locator('xpath=following-sibling::*[1]')).toHaveClass(/qa-menu-verwijderen/);
});

test('de knop naar de sub-pagina staat altijd rechtsboven in de sectie: eerst Invullen, en Bewerken met potlood zodra de inschrijving compleet is', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  const sectie = page.locator('.qa-sectie-inschrijving');
  const knop = sectie.locator('.qa-naar-inschrijving');
  const titel = sectie.locator('h2');
  const rechtsboven = async () => {
    const [k, t, s] = [(await knop.boundingBox())!, (await titel.boundingBox())!, (await sectie.boundingBox())!];
    expect(Math.abs(k.y + k.height / 2 - (t.y + t.height / 2))).toBeLessThan(8);
    expect(s.x + s.width - (k.x + k.width)).toBeLessThan(40);
  };
  await expect(knop).toHaveText('Invullen');
  await expect(knop).toHaveClass(/btn-primary/);
  await rechtsboven();

  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'inschrijving_afgerond', aan: true });
  await page.reload();
  await expect(knop).toHaveText('Bewerken');
  await expect(knop.locator('.bi-pencil')).toBeVisible();
  await rechtsboven();
});

test('de samenvatting zet labels als smalle kolom naast de waarden, en op een telefoon het label boven de waarde, behalve bij een leeg veld', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  const regel = page.locator('.qa-sectie-inschrijving .qa-sv-rioolstelsel');
  const [label, waarde] = [regel.locator('dt'), regel.locator('dd')];
  // The label column is as wide as the longest label ("Bodemsituatie"), not a fixed width.
  const langste = (await page.locator('.qa-sectie-inschrijving .qa-sv-bodemsituatie dt').boundingBox())!;
  let [l, w] = [(await label.boundingBox())!, (await waarde.boundingBox())!];
  expect(Math.abs(l.y - w.y)).toBeLessThan(4);
  expect(w.x - (langste.x + langste.width)).toBeLessThan(32);

  await page.setViewportSize({ width: 390, height: 800 });
  [l, w] = [(await label.boundingBox())!, (await waarde.boundingBox())!];
  expect(w.y).toBeGreaterThanOrEqual(l.y + l.height - 1);
  expect(Math.abs(w.x - l.x)).toBeLessThan(2);

  const leeg = page.locator('.qa-sectie-inschrijving .qa-sv-boorlocatie');
  await expect(leeg.locator('dd')).toHaveText('--');
  [l, w] = [(await leeg.locator('dt').boundingBox())!, (await leeg.locator('dd').boundingBox())!];
  expect(w.x).toBeGreaterThan(l.x + l.width);
  expect(Math.abs(w.y + w.height - (l.y + l.height))).toBeLessThan(6);
});

test('zonder ingevulde aantallen toont Materialen alleen --', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}/plan`);
  await expect(page.locator('.qa-materialen-materialen .qa-materiaal-rij').first()).toBeVisible();
  await page.goto(`/dossiers/${id}`);
  await expect(page.locator('.qa-sv-materialen')).toHaveText(/^\s*Materialen\s*--\s*$/);
});

test('een verstuurde bezoekersmail staat op de rij van de toewijzing, met Opnieuw mailen in plaats van de knop', async ({ page }) => {
  const { klusserId } = await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await subsidieMail(page, 'koop');
  const sectie = page.locator('.qa-sectie-bezoeker');
  await wijsToe(page, 'bezoeker', klusserId, false);
  await expect(sectie.locator('.qa-mail-bezoeker_toegewezen')).toBeVisible();

  await sectie.locator('.qa-mail-bezoeker_toegewezen').click();
  await page.locator('.qa-mail .qa-mail-versturen').click();
  await expect(sectie.locator('.qa-verstuurd')).toBeVisible();
  await expect(sectie.locator('.qa-mail-bezoeker_toegewezen')).toHaveCount(0);
  const [knop, regel] = [(await sectie.locator('.qa-toewijzen-knop').boundingBox())!, (await sectie.locator('.qa-verzonden').boundingBox())!];
  expect(Math.abs(knop.y + knop.height / 2 - (regel.y + regel.height / 2))).toBeLessThan(8);

  await sectie.locator('.qa-opnieuw-mailen').click();
  await expect(page.locator('.qa-mail .qa-mail-aan')).toBeVisible();
});

test('Notities is tekst tot je op Bewerken tikt; dan krijgt het tekstvak de focus en slaat het op', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  await expect(veld(page, 'notities')).toHaveCount(0);
  await expect(page.locator('.qa-notities')).toContainText('--');

  await page.locator('.qa-notities-bewerken').click();
  const invoer = veld(page, 'notities').locator('.qa-invoer');
  await expect(invoer).toBeFocused();
  await invoer.fill('Sleutel ligt bij de buren');
  await page.locator('.qa-dossier-titel').click();
  await expect(page.locator('.qa-notities')).toContainText('Sleutel ligt bij de buren');
  await opslagKlaar(page);
  await page.reload();
  await expect(page.locator('.qa-notities')).toContainText('Sleutel ligt bij de buren');
});

test('elke sectie op de dossierpagina heeft een kleine schaduw', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  const secties = page.locator('section.sectie');
  await expect(secties.first()).toBeVisible();
  expect(await secties.count()).toBeGreaterThan(3);
  for (const schaduw of await secties.evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow))) expect(schaduw).not.toBe('none');
});

test('elke stap-pagina heeft onderaan ook een link terug naar het dossier', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  for (const stap of ['inschrijving', 'bezoek', 'plan', 'uitvoering']) {
    await page.goto(`/dossiers/${id}/${stap}`);
    const links = page.locator('.qa-terug');
    await expect(links).toHaveCount(2);
    const onder = links.last();
    await expect(onder).toBeVisible();
    // Below the step's own completion button, at the end of the page.
    const knop = page.locator('.qa-inschrijving-klaar, .qa-bezoek-afronden, .qa-klaar-voor-controle, .qa-werk-opgeleverd');
    await expect(knop).toBeVisible();
    expect((await onder.boundingBox())!.y).toBeGreaterThan((await knop.boundingBox())!.y);
    await onder.click();
    await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));
  }
});
