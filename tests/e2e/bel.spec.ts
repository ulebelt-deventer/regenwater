// The navbar bell: in-app meldingen for a dossier's eigenaar.
import { type Page, expect, test } from '@playwright/test';
import { BEHEERDER, KLUSSER, login, post, start } from './hulp.ts';

// Two dossiers of the admin, each handed off by the klusser with Klaar voor controle; the second is the newest melding.
async function tweeMeldingen(page: Page, klusserId: number): Promise<[number, number]> {
  const ids: number[] = [];
  for (let i = 0; i < 2; i++) {
    const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
    await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: klusserId });
    ids.push(id);
  }
  await login(page, KLUSSER.email);
  for (const id of ids) await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
  await login(page, BEHEERDER.email);
  return [ids[0], ids[1]];
}

test('de bel telt de ongelezen meldingen, ook in de kop; een melding openen gaat naar het dossier en markeert die als gelezen', async ({ page }) => {
  const { klusserId } = await start(page);
  const [eerste, tweede] = await tweeMeldingen(page, klusserId);
  await page.goto('/');
  await expect(page.locator('.qa-bel-aantal')).toHaveText('2');
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-bel-kop')).toHaveText('2 ongelezen meldingen');
  const items = page.locator('.qa-notificatie');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('.qa-notificatie-tekst')).toHaveText(`Dossier ${tweede} (nog geen adres): Klaar voor controle (Kees Klusser)`);
  await expect(page.locator('.qa-notificatie-ongelezen')).toHaveCount(2);
  await items.first().click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${tweede}$`));
  await expect(page.locator('.qa-bel-aantal')).toHaveText('1');
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-bel-kop')).toHaveText('1 ongelezen melding');
  await expect(page.locator('.qa-notificatie-ongelezen')).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('href', `/dossiers/${eerste}`);
  await expect(items.first()).toHaveClass(/qa-notificatie-ongelezen/);
  // The melding about the dossier on screen isn't highlighted as the active link.
  await expect(page.locator(`.qa-notificatie[href="/dossiers/${tweede}"]`)).not.toHaveClass(/\bactive\b/);
  await items.first().click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${eerste}$`));
  await expect(page.locator('.qa-bel-aantal')).toHaveCount(0);
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-bel-kop')).toHaveText('2 meldingen (alle gelezen)');
});

test('een klusser heeft geen bel, en zonder meldingen zegt de bel dat', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await page.locator('.qa-nav-bel').click();
  await expect(page.locator('.qa-bel-kop')).toHaveText('Meldingen');
  await expect(page.locator('.qa-bel-leeg')).toBeVisible();
  await expect(page.locator('.qa-bel-aantal')).toHaveCount(0);
  await login(page, KLUSSER.email);
  await page.reload();
  await expect(page.locator('.qa-nav-account')).toBeVisible();
  await expect(page.locator('.qa-nav-bel')).toHaveCount(0);
});

test('op een telefoon valt het menu van de bel niet buiten het scherm, en een melding is hoogstens twee regels met de stip ervoor en de tijd eronder', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const { klusserId } = await start(page);
  await tweeMeldingen(page, klusserId);
  // The newest melding, from a klusser with a long name, is too long for two lines.
  const lang = { naam: 'Johannes Hendrikus van der Westerveld-Bosmans', email: 'johannes@ulebelt.test' };
  const { id: langId } = await post<{ id: number }>(page.request, '/api/test/gebruiker', { ...lang, rol: 'klusser' });
  const { id } = await post<{ id: number }>(page.request, '/api/dossiers');
  await post(page.request, `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: langId });
  await login(page, lang.email);
  await post(page.request, `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
  await login(page, BEHEERDER.email);
  await page.goto('/');
  await page.locator('.qa-nav-bel').click();
  const menu = page.locator('.bel-lijst').locator('xpath=..');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  const items = page.locator('.qa-notificatie');
  await expect(items).toHaveCount(3);
  const regels = async (i: number) => {
    const tekst = items.nth(i).locator('.qa-notificatie-tekst');
    await expect(tekst).toBeVisible();
    return tekst.evaluate((el) => ({ aantal: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight), afgekapt: el.scrollHeight > el.clientHeight }));
  };
  const lange = await regels(0);
  expect(lange.aantal).toBeCloseTo(2, 1);
  expect(lange.afgekapt).toBe(true);
  const korte = await regels(1);
  expect(korte.aantal).toBeLessThanOrEqual(2.1);
  expect(korte.afgekapt).toBe(false);

  const tekst = items.first().locator('.qa-notificatie-tekst');
  const stip = items.first().locator('.bg-danger');
  const tijd = tekst.locator('xpath=following-sibling::div');
  for (const el of [stip, tijd]) await expect(el).toBeVisible();
  const [s, t, d] = [(await stip.boundingBox())!, (await tekst.boundingBox())!, (await tijd.boundingBox())!];
  expect(s.x + s.width).toBeLessThanOrEqual(t.x);
  expect(s.y).toBeLessThan(t.y + t.height / 2);
  expect(d.y).toBeGreaterThanOrEqual(t.y + t.height);
  expect(d.x).toBe(t.x);
});
