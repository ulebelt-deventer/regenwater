// Explanation pages: Statussen and Aandacht-criteria, generated from the rules the app uses, plus Installeren and Privacy.
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { KLOPT_NIET_KOP, KLOPT_NIET_REGELS, LIGT_STIL_REGELS } from '../../shared/aandacht.ts';
import { ULEBELT_CONTACT_EMAIL } from '../../shared/constants.ts';
import { LIGT_BIJ_LABEL, STAPPEN } from '../../shared/status.ts';
import { SLUIT_REDENEN } from '../../shared/types.ts';
import { AlleenBeheerder, StatusLabel, titel } from '../ui.tsx';

const stapLabel = (key: string) => {
  const s = STAPPEN.find((x) => x.key === key);
  if (!s) throw new Error(`Onbekende stap ${key}`);
  return `${s.nr}. ${s.label}`;
};

export function Statussen() {
  titel('Uitleg: statussen');
  return (
    <>
      <h1 class="h3">Uitleg: statussen</h1>
      <p>De status van een dossier stel je nooit met de hand in: de app leidt hem af uit de gegevens. De eerste stap waarvan de regel klopt, is de huidige stap. De kleur laat zien bij wie de bal ligt.</p>
      <div class="table-responsive">
        <table class="table align-middle qa-statussen">
          <thead>
            <tr>
              <th>#</th>
              <th>Ligt bij</th>
              <th>Status</th>
              <th>Huidig zolang</th>
            </tr>
          </thead>
          <tbody>
            <For each={STAPPEN}>
              {(s) => (
                <tr class={`qa-stap-${s.key}`}>
                  <td>{s.nr}</td>
                  <td>{LIGT_BIJ_LABEL[s.ligtBij]}</td>
                  <td><StatusLabel label={s.label} ligtBij={s.ligtBij} /></td>
                  <td>{s.regel}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <h2 class="h5 mt-4">Gesloten</h2>
      <p>Sluiten staat los van deze stappen. Een gesloten dossier bewaart wanneer, door wie en waarom het is gesloten ({SLUIT_REDENEN.join(', ')}) en toont <StatusLabel label="Gesloten" ligtBij={null} /> in plaats van een stap. Heropenen haalt dat weg; de stap wordt dan opnieuw afgeleid uit de gegevens.</p>
      <p class="mb-0">Elke stap wordt vastgelegd met een tijdstip en wie het deed, zodat de aandacht-regels weten hoe lang iets al stilligt.</p>
    </>
  );
}

export function AandachtUitleg() {
  titel('Uitleg: aandacht');
  return (
    <AlleenBeheerder>
      <h1 class="h3">Uitleg: aandacht</h1>
      <p>Een dossier heeft aandacht nodig als er minstens één bevinding is van een van de drie soorten hieronder. Elke bevinding is een regel in de rode balk bovenaan het dossier, met een link naar wat je moet aanpassen, en het dossier krijgt het rode label “aandacht” in lijsten en tellingen. De app berekent dit bij elke pagina opnieuw uit de gegevens. De tellingen op het Overzicht en de wekelijkse mail gaan over open dossiers; het dossier zelf en het Aandacht-filter in de lijst tonen ook gesloten dossiers.</p>

      <section class="card card-body mb-3 qa-klopt-niet-regels">
        <h2 class="h5">Klopt niet</h2>
        <p>Staat bovenaan de balk, onder de kop “{KLOPT_NIET_KOP}” Geldt voor open en gesloten dossiers en kan niet worden uitgesteld.</p>
        <div class="table-responsive">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>Regel</th>
                <th>Tekst in de balk</th>
              </tr>
            </thead>
            <tbody>
              <For each={KLOPT_NIET_REGELS}>
                {([regel, tekst]) => (
                  <tr>
                    <td>{regel}</td>
                    <td class="fst-italic">{tekst}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card card-body mb-3 qa-plan-gewijzigd-regels">
        <h2 class="h5">Plan gewijzigd</h2>
        <p class="mb-0">Voor open dossiers: het Plan van Aanpak is gewijzigd nadat het naar de bewoner, de woningcorporatie of de uitvoerder is gestuurd, en na de laatste “Opnieuw versturen niet nodig”. Eén regel per ontvanger: <span class="fst-italic">“Het plan is gewijzigd op {'{datum}'}, na het versturen naar {'{ontvanger}'} op {'{datum}'}. Stuur het opnieuw, of markeer dat dat niet nodig is.”</span> Verdwijnt door opnieuw te versturen of door “Opnieuw versturen niet nodig”; kan niet worden uitgesteld.</p>
      </section>

      <section class="card card-body mb-3 qa-ligt-stil-regels">
        <h2 class="h5">Ligt stil</h2>
        <p>Alleen voor open dossiers en alleen voor de huidige stap. De klok start wanneer de stap begon: bij de vorige stap, bij het aanmaken voor de intake, en bij de eerste subsidiemail voor het toewijzen van een bezoeker. De twee geplande stappen tellen vanaf hun geplande datum.</p>
        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Stap</th>
                <th>Aandacht als</th>
                <th>Tekst in de balk</th>
              </tr>
            </thead>
            <tbody>
              <For each={LIGT_STIL_REGELS}>
                {(r) => (
                  <tr>
                    <td class="text-nowrap">{stapLabel(r.stap)}</td>
                    <td>{r.wanneer}</td>
                    <td class="fst-italic">{r.tekst}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p>Je kunt een Ligt stil-bevinding uitstellen tot een datum, met een notitie (“Aandacht uitstellen” in het menu van het dossier). Zolang hij is uitgesteld staat er een grijze regel en telt hij niet als aandacht. Het uitstel stopt op de datum of zodra de stap verandert.</p>
        <p class="mb-0">Klussers zien Ligt stil alleen voor hun eigen stappen ({['afspraak', 'bezoek', 'plan', 'uitvoering'].map(stapLabel).join(', ')}), als herinnering, zonder het aandacht-label.</p>
      </section>
    </AlleenBeheerder>
  );
}

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export function Installeren() {
  titel('App op je telefoon zetten');
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const geinstalleerd = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const [prompt, setPrompt] = createSignal<InstallPrompt | null>(null);

  onMount(() => {
    const vang = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', vang);
    onCleanup(() => window.removeEventListener('beforeinstallprompt', vang));
  });
  const installeer = async () => {
    await prompt()!.prompt();
    setPrompt(null);
  };

  const iphone = (
    <ol class="mb-0">
      <li>Open deze pagina in Safari zelf, niet in de browser van je mail-app.</li>
      <li>Tik op de Deel-knop (het vierkantje met de pijl omhoog).</li>
      <li>Kies “Zet op beginscherm”.</li>
      <li>Tik op “Voeg toe”.</li>
    </ol>
  );
  const androidStappen = (
    <ol class="mb-0">
      <li>Tik in Chrome op het menu ⋮ rechtsboven.</li>
      <li>Kies “App installeren” (of “Toevoegen aan startscherm”).</li>
    </ol>
  );

  return (
    <>
      <h1 class="h3">App op je telefoon zetten</h1>
      <Show
        when={!geinstalleerd}
        fallback={<div class="alert alert-success qa-al-geinstalleerd">De app staat al op je telefoon.</div>}
      >
        <Show when={!ios && !android}>
          <div class="alert alert-warning fs-5 qa-open-op-telefoon">Open deze pagina op je telefoon.</div>
        </Show>
        <Show when={prompt()}>
          <button type="button" class="btn btn-primary btn-lg mb-3 qa-installeren" onClick={() => void installeer()}>Installeren</button>
        </Show>
        <section class="card card-body mb-3">
          <h2 class="h5">{android ? 'Android (Chrome)' : 'iPhone (Safari)'}</h2>
          {android ? androidStappen : iphone}
        </section>
        <details class="card card-body mb-3">
          <summary class="fw-semibold">{android ? 'iPhone (Safari)' : 'Android (Chrome)'}</summary>
          <div class="pt-2">{android ? iphone : androidStappen}</div>
        </details>
        <p class="mb-0">Open daarna de app via het nieuwe icoontje en log nog één keer in met je e-mailadres en code. De app op je beginscherm heeft een eigen login, los van die in je browser.</p>
      </Show>
    </>
  );
}

// PLACEHOLDER: the text waits on who the data controller is and the retention period (see the open questions in the spec).
export function Privacy() {
  titel('Privacy');
  return (
    <>
      <h1 class="h3">Privacy</h1>
      <div class="alert alert-warning qa-privacy-concept">Dit is een concepttekst. De definitieve versie volgt zodra vaststaat wie verwerkingsverantwoordelijke is.</div>
      <section class="card card-body mb-3">
        <h2 class="h5">Waarvoor</h2>
        <p class="mb-0">Ulebelt helpt bewoners hun regenpijpen af te koppelen van het riool. In deze app houden vrijwilligers en beheerders per woning een dossier bij: van de aanvraag via het bezoek en het Plan van Aanpak tot de uitvoering.</p>
      </section>
      <section class="card card-body mb-3">
        <h2 class="h5">Welke gegevens</h2>
        <ul class="mb-0">
          <li>Over de bewoner: naam, e-mailadres, telefoonnummer, adres en of de woning huur of koop is.</li>
          <li>Over de woning en de tuin: foto’s, een schets op de kadastrale kaart, metingen en wat er is afgesproken en uitgevoerd.</li>
          <li>Over gebruikers van de app: naam, e-mailadres, telefoonnummer en wanneer ze de app gebruikten. Elke wijziging wordt vastgelegd met wie het deed.</li>
        </ul>
      </section>
      <section class="card card-body mb-3">
        <h2 class="h5">Wie het ziet</h2>
        <p class="mb-0">Beheerders zien alle dossiers. Een vrijwilliger ziet alleen de dossiers waaraan die is toegewezen. Het Plan van Aanpak en het opleverrapport gaan naar de bewoner en, bij een huurwoning, naar de woningcorporatie.</p>
      </section>
      <section class="card card-body mb-3">
        <h2 class="h5">Waar het staat</h2>
        <ul class="mb-0">
          <li>De app en de gegevens staan op een server van Netcup in Duitsland.</li>
          <li>Back-ups staan bij een opslagdienst in de EU.</li>
          <li>E-mails worden verstuurd via Mailgun (EU-regio).</li>
          <li>Adressen en kaarten komen van PDOK (Kadaster) en bodemgegevens van BRO; daarvoor wordt alleen het adres of de locatie gebruikt.</li>
        </ul>
      </section>
      <section class="card card-body mb-3">
        <h2 class="h5">Bewaren en je rechten</h2>
        <p class="mb-0">Hoe lang gegevens bewaard blijven, wordt nog vastgesteld. Wil je weten welke gegevens over jou zijn vastgelegd, of wil je ze laten verwijderen of aanpassen? Mail <a href={`mailto:${ULEBELT_CONTACT_EMAIL}`}>{ULEBELT_CONTACT_EMAIL}</a>.</p>
      </section>
    </>
  );
}
