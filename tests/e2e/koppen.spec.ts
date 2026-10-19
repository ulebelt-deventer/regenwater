// Headings keep Bootstrap's own size for their level: no .h3 on an h1 or similar.
import { expect, test } from '@playwright/test';
import { nieuwDossier, start } from './hulp.ts';

test('elke kop h1 tot en met h6 heeft op elke pagina de lettergrootte van zijn eigen niveau', async ({ page }) => {
  await start(page);
  const id = await nieuwDossier(page, { huurKoop: 'koop' });
  const paginas = ['/', '/dossiers', `/dossiers/${id}`, `/dossiers/${id}/inschrijving`, `/dossiers/${id}/bezoek`, `/dossiers/${id}/plan`, `/dossiers/${id}/activiteit`, '/gebruikers', '/beheer/materialen', '/beheer/sjablonen', '/beheer/feedback', '/beheer/activiteit', '/beheer/nieuw', '/uitleg/statussen', '/uitleg/aandacht', '/uitleg/rechten', '/installeren', '/privacy'];
  for (const pad of paginas) {
    await page.goto(pad);
    await expect(page.locator('main h1, main h2').first(), pad).toBeVisible();
    // A dropdown-header is Bootstrap's small menu caption, not a page heading.
    const afwijkend = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
        .filter((h) => !h.classList.contains('dropdown-header'))
        .flatMap((h) => {
          const kaal = document.body.appendChild(document.createElement(h.tagName));
          const verwacht = getComputedStyle(kaal).fontSize;
          kaal.remove();
          const echt = getComputedStyle(h).fontSize;
          return echt === verwacht ? [] : [`${h.tagName} "${h.textContent!.trim()}": ${echt}, verwacht ${verwacht}`];
        }),
    );
    expect(afwijkend, pad).toEqual([]);
  }
});
