// The details page summarises every sub-page field as text, and a done step's Bewerken sits in its section's top right corner.
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { bezoek, nieuwDossier, opslagKlaar, post, start, subsidieMail, tikAan, veld, wijsToe, zet } from './hulp.ts';

const PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#88d356' } }).png().toBuffer();

test('de samenvattingen tonen alle ingevulde velden van inschrijving, bezoek, plan en uitvoering', async ({ page }) => {
  const { beheerderId, klusserId } = await start(page);
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
    bewoner_doet: 'Tuin opruimen op plek regenton\nVoor 1 mei',
    materialen: ['m1', 'm2'],
    'materiaal.m1.naam': 'Regenton 210 liter',
    'materiaal.m1.prijs': 4500,
    'materiaal.m1.aantal': 2,
    'materiaal.m2.naam': 'Klikmof',
    'materiaal.m2.aantal': 0,
    voorstel: 'Regenton plaatsen\nWadi graven',
    uitgevoerd: 'Regenton geplaatst',
  });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond', 'klaar_voor_controle', 'corporatie_akkoord'], beheerderId);
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: klusserId });
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
  await expect(pijp).toContainText('Afkoppelen: Ja · van D1 · 480 liter waterberging · PVC · 80 mm · Regenton: Niet aanwezig, wel gewenst');
  await expect(pijp).toContainText('Ondergrond: Tegels');
  await expect(pijp).toContainText('Water naar: De border in');
  await expect(pijp).toContainText('Via: Holie Molie');
  await expect(bezoek.locator('.qa-sv-hoosbuien')).toContainText('Plas op het terras');
  await expect(bezoek.locator('.qa-sv-wensen')).toContainText('Regenton bij de schuur');
  await expect(bezoek.locator('.qa-sv-bewoner_doet li')).toHaveText(['Tuin opruimen op plek regenton', 'Voor 1 mei']);
  await expect(bezoek.locator('.qa-sv-ulebelt_doet')).toContainText('--');

  const plan = page.locator('.qa-sectie-plan');
  await expect(plan.locator('.qa-sv-beoordeling')).toContainText('Wensen uitvoerbaar');
  await expect(plan.locator('.qa-sv-beoordeling_toelichting')).toContainText('Prima te doen');
  const materialen = plan.locator('.qa-sv-materialen');
  await expect(materialen).toContainText('2 × Regenton 210 liter à € 45,00');
  await expect(materialen).toContainText('Totaal € 90,00 (geschat)');
  await expect(materialen).not.toContainText('Klikmof');
  await expect(plan.locator('.qa-sv-voorstel li')).toHaveText(['Regenton plaatsen', 'Wadi graven']);

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
  const { beheerderId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond'], beheerderId);
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

test('de bezoekerkeuze begint met - niemand - en toont de huidige bezoeker in de lijst als actief; hem opnieuw kiezen doet niets', async ({ page }) => {
  const { klusserId } = await start(page);
  await nieuwDossier(page, { huurKoop: 'koop' });
  await subsidieMail(page, 'koop');
  const blok = page.locator('.qa-toewijzen-bezoeker');
  await blok.locator('.qa-toewijzen-knop').click();
  const niemand = blok.locator('.dropdown-item').first();
  await expect(niemand).toHaveText('- niemand -');
  await expect(niemand).toHaveClass(/\bactive\b/);
  await page.keyboard.press('Escape');

  await wijsToe(page, 'bezoeker', klusserId, false);
  await blok.locator('.qa-toewijzen-knop').click();
  const huidig = blok.locator(`.qa-kandidaat-${klusserId}`);
  await expect(huidig).toBeVisible();
  await expect(huidig).toHaveClass(/\bactive\b/);
  await expect(blok.locator('.dropdown-item.active')).toHaveCount(1);
  await huidig.click();
  await expect(blok.locator('.dropdown-menu')).toBeHidden();
  await expect(page.locator('.qa-mail')).toHaveCount(0);

  await blok.locator('.qa-toewijzen-knop').click();
  await blok.locator('.qa-kandidaat-niemand').click();
  await expect(blok.locator('.qa-toewijzen-knop')).toHaveText('Kies...');
});

test('Notities is tekst tot je op Bewerken tikt; dan krijgt het tekstvak de focus, zegt het wie het ziet en slaat het op', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  await expect(veld(page, 'notities')).toHaveCount(0);
  await expect(page.locator('.qa-notities')).toContainText('--');

  await page.locator('.qa-notities-bewerken').click();
  const invoer = veld(page, 'notities').locator('.qa-invoer');
  await expect(invoer).toBeFocused();
  await expect(veld(page, 'notities').locator('.qa-hint')).toContainText('de bewoner en de woningcorporatie niet');
  await invoer.fill('Sleutel ligt bij de buren');
  await page.locator('.qa-dossier-titel').click();
  await expect(page.locator('.qa-notities')).toContainText('Sleutel ligt bij de buren');
  await opslagKlaar(page);
  await page.reload();
  await expect(page.locator('.qa-notities')).toContainText('Sleutel ligt bij de buren');
});

test('elke sectie op de dossierpagina heeft een kleine schaduw', async ({ page }) => {
  const { beheerderId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond'], beheerderId);
  await page.goto(`/dossiers/${id}`);
  const secties = page.locator('section.sectie');
  await expect(secties.first()).toBeVisible();
  expect(await secties.count()).toBeGreaterThan(3);
  for (const schaduw of await secties.evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow))) expect(schaduw).not.toBe('none');
});

test('kaart, straatfoto en boorprofiel staan in die volgorde als vierkante foto’s zo breed als op de Inschrijving naast elkaar, op een telefoon onder elkaar', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  for (const slot of ['kaart', 'straatfoto', 'boorprofiel']) {
    await page.locator(`.qa-fotoslot-${slot} .qa-foto-invoer`).setInputFiles({ name: `${slot}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(page.locator(`.qa-fotoslot-${slot} .qa-foto`)).toBeVisible();
  }
  await opslagKlaar(page);
  const inschrijving = (await page.locator('.qa-fotoslot-straatfoto .qa-foto').boundingBox())!.width;
  await page.goto(`/dossiers/${id}`);
  const vakken = page.locator('.qa-sv-fotos > *');
  await expect(vakken).toHaveCount(3);
  expect(await vakken.evaluateAll((els) => els.map((e) => e.className.match(/qa-sv-(\w+)/)![1]))).toEqual(['kaart', 'straatfoto', 'boorprofiel']);
  await expect(page.locator('.qa-sv-kaart')).not.toContainText('schaal');
  const fotos = page.locator('.qa-sv-fotos .qa-foto');
  await expect(fotos).toHaveCount(3);
  const boxen = async () => Promise.all([0, 1, 2].map(async (i) => (await fotos.nth(i).boundingBox())!));
  const breed = await boxen();
  for (const b of breed) {
    expect(Math.abs(b.width - inschrijving)).toBeLessThan(2);
    expect(Math.abs(b.width - b.height)).toBeLessThan(2);
    expect(Math.abs(b.y - breed[0].y)).toBeLessThan(2);
  }
  expect(breed[1].x).toBeGreaterThan(breed[0].x + breed[0].width);

  await page.setViewportSize({ width: 375, height: 800 });
  const smal = await boxen();
  expect(smal[1].y).toBeGreaterThan(smal[0].y + smal[0].height);
  expect(Math.abs(smal[0].width - smal[0].height)).toBeLessThan(2);
  expect(smal[0].width).toBeLessThanOrEqual(inschrijving + 1);
});

test('na een niet aangetikte mijlpaal staan alle volgende stappen grijs, met waarom ze nog niet beschikbaar zijn', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await page.goto(`/dossiers/${id}`);
  const dicht = page.locator('.qa-dicht');
  const titels = ['Bezoeker', 'Bezoek', 'Plan van Aanpak', 'Plan versturen & goedkeuring', 'Uitvoerder', 'Uitvoering', 'Oplevering'];
  await expect(dicht).toHaveCount(titels.length);
  for (const [i, titel] of titels.entries()) {
    await expect(dicht.nth(i).locator('h2')).toHaveText(titel);
    await expect(dicht.nth(i).locator('.qa-dicht-reden')).toHaveText('Nog niet beschikbaar. Rond eerst de eerdere stappen af.');
  }
  await expect(page.locator('.qa-sectie-bezoeker')).toHaveCount(0);
  const kleur = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await kleur('.qa-dicht')).not.toBe(await kleur('.qa-sectie-inschrijving'));
  expect((await dicht.first().boundingBox())!.y).toBeGreaterThan((await page.locator('.qa-sectie-inschrijving').boundingBox())!.y);

  await zet(page, id, { rioolstelsel: 'gescheiden' });
  await page.reload();
  await expect(dicht.first().locator('.qa-dicht-reden')).toHaveText('Niet van toepassing: dit adres is niet subsidiabel.');
});

test('een open stap zonder aangetikte mijlpaal zegt dat in oranje, met een link naar de stap-pagina; daarna opent de volgende stap', async ({ page }) => {
  const { beheerderId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  const nogNiet = (sectie: string) => page.locator(`.qa-sectie-${sectie} .qa-nog-niet`);
  const stappen: [string, string, () => Promise<unknown>][] = [
    ['inschrijving', '"Inschrijving is compleet" is nog niet aangetikt.', () => post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'inschrijving_afgerond', aan: true })],
    ['bezoek', '"Bezoek afronden" is nog niet aangetikt.', () => post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'bezoek_afgerond', aan: true })],
    ['plan', '"Klaar voor controle" is nog niet aangetikt.', () => post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle', aan: true })],
  ];
  const volgende: Record<string, string> = { inschrijving: 'bezoeker', bezoek: 'plan', plan: 'versturen' };
  for (const [sectie, tekst, aantikken] of stappen) {
    if (sectie === 'bezoek') {
      await expect(page.locator('.qa-dicht-sectie-bezoek')).toBeVisible();
      await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: beheerderId });
    }
    await page.goto(`/dossiers/${id}`);
    await expect(nogNiet(sectie)).toContainText(tekst);
    await expect(nogNiet(sectie).locator('.qa-nog-niet-link')).toHaveAttribute('href', `/dossiers/${id}/${sectie}`);
    await expect(page.locator(`.qa-dicht-sectie-${volgende[sectie]}`)).toBeVisible();
    await aantikken();
    await page.reload();
    await expect(nogNiet(sectie)).toHaveCount(0);
    await expect(page.locator(`.qa-sectie-${volgende[sectie]}`)).toBeVisible();
  }
});

test('Bezoek afronden brengt je terug naar het dossier, met de Bezoek-sectie bovenaan', async ({ page }) => {
  const { beheerderId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await tikAan(page, id, ['inschrijving_afgerond'], beheerderId);
  await bezoek(page, id);
  await expect.poll(async () => Math.round((await page.locator('.qa-sectie-bezoek').boundingBox())!.y)).toBe(16);
  await expect(page.locator('.qa-sectie-plan .qa-naar-plan')).toBeVisible();
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
    const b = (await onder.boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - (page.viewportSize()!.width) / 2)).toBeLessThan(20);
    // Below the step's own completion button, at the end of the page.
    const knop = page.locator('.qa-inschrijving-klaar, .qa-bezoek-afronden, .qa-klaar-voor-controle, .qa-werk-opgeleverd');
    await expect(knop).toBeVisible();
    expect((await onder.boundingBox())!.y).toBeGreaterThan((await knop.boundingBox())!.y);
    await onder.click();
    await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));
  }
});

test('de terug-link van een stap-pagina zet het dossier op de sectie van die stap', async ({ page }) => {
  const { beheerderId } = await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  await tikAan(page, id, ['inschrijving_afgerond', 'bezoek_afgerond'], beheerderId);
  for (const stap of ['inschrijving', 'bezoek', 'plan']) {
    await page.goto(`/dossiers/${id}/${stap}`);
    await page.locator('.qa-terug').last().click();
    await expect(page).toHaveURL(new RegExp(`/dossiers/${id}$`));
    const sectie = page.locator(`.qa-sectie-${stap}`);
    await expect(sectie).toBeInViewport();
    // At 1rem below the top of the screen, unless the page can't scroll that far.
    await expect.poll(async () => page.evaluate((s) => {
      const top = document.querySelector(s)!.getBoundingClientRect().top;
      const onderaan = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      return Math.abs(top - 16) < 2 || (onderaan && top > 16);
    }, `.qa-sectie-${stap}`)).toBe(true);
  }
});
