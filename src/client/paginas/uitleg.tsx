// Explanation pages: Statussen, Aandacht-criteria and Rechten, generated from the rules the app uses, plus Installeren and Privacy.
import { For, type JSX, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { KLOPT_NIET_KOP, KLOPT_NIET_REGELS, LIGT_STIL_REGELS } from '../../shared/aandacht.ts';
import { ULEBELT_CONTACT_EMAIL } from '../../shared/constants.ts';
import { LIGT_BIJ_LABEL, STAPPEN } from '../../shared/status.ts';
import { SLUIT_REDENEN } from '../../shared/types.ts';
import { type Bewerker, FOTO_SLOTS, type Pagina, VELDEN } from '../../shared/velden.ts';
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
      <h1>Uitleg: statussen</h1>
      <p>De status van een dossier stel je nooit met de hand in: de app leidt hem af uit de gegevens. De eerste stap waarvan de regel klopt, is de huidige stap. De kleur laat zien bij wie de bal ligt.</p>
      <div class="table-responsive">
        <table class="table align-middle tabel-kaarten qa-statussen">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Ligt bij</th>
              <th>Huidig zolang</th>
            </tr>
          </thead>
          <tbody>
            <For each={STAPPEN}>
              {(s) => (
                <tr class={`qa-stap-${s.key}`}>
                  {/* On phones the step number moves into the status cell. */}
                  <td class="d-none d-md-table-cell">{s.nr}</td>
                  <td class="fw-semibold"><span class="d-md-none">{s.nr}: </span>{s.label}</td>
                  <td data-label="Ligt bij"><span class={`bij bij-${s.ligtBij}`}>{LIGT_BIJ_LABEL[s.ligtBij]}</span></td>
                  <td data-label="Huidig zolang">{s.regel}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <h2 class="mt-4">Gesloten</h2>
      <p>Sluiten staat los van deze stappen. Een gesloten dossier bewaart wanneer, door wie en waarom het is gesloten ({SLUIT_REDENEN.join(', ')}) en toont <StatusLabel label="Gesloten" ligtBij={null} /> in plaats van een stap. Heropenen haalt dat weg; de stap wordt dan opnieuw afgeleid uit de gegevens.</p>
      <p class="mb-0">Elke stap wordt vastgelegd met een tijdstip en wie het deed, zodat de aandacht-regels weten hoe lang iets al stilligt.</p>
    </>
  );
}

export function AandachtUitleg() {
  titel('Uitleg: aandacht');
  return (
    <AlleenBeheerder>
      <h1>Uitleg: aandacht</h1>
      <p>Een dossier heeft aandacht nodig als er minstens één bevinding is van een van de drie soorten hieronder. Elke bevinding is een regel in de rode balk bovenaan het dossier, met een link naar wat je moet aanpassen, en het dossier krijgt het rode label “aandacht” in lijsten en tellingen. De app berekent dit bij elke pagina opnieuw uit de gegevens. De tellingen op het Overzicht en de wekelijkse mail gaan over open dossiers; het dossier zelf en het Aandacht-filter in de lijst tonen ook gesloten dossiers.</p>

      <section class="card card-body mb-3 qa-klopt-niet-regels">
        <h2>Klopt niet</h2>
        <p>Staat bovenaan de balk, onder de kop “{KLOPT_NIET_KOP}” Geldt voor open en gesloten dossiers en kan niet worden uitgesteld.</p>
        <div class="table-responsive">
          <table class="table table-sm mb-0 tabel-kaarten">
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
                    <td class="fw-semibold fw-md-normal">{regel}</td>
                    <td class="fst-italic" data-label="Tekst in de balk">{tekst}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card card-body mb-3 qa-plan-gewijzigd-regels">
        <h2>Plan gewijzigd</h2>
        <p class="mb-0">Voor open dossiers: het Plan van Aanpak is gewijzigd nadat het naar de bewoner, de woningcorporatie of de uitvoerder is gestuurd, en na de laatste “Opnieuw versturen niet nodig”. Eén regel per ontvanger: <span class="fst-italic">“Plan gewijzigd op {'{datum}'}, na versturen naar {'{ontvanger}'}. Opnieuw sturen?”</span> Verdwijnt door opnieuw te versturen of door “Opnieuw versturen niet nodig”; kan niet worden uitgesteld.</p>
      </section>

      <section class="card card-body mb-3 qa-ligt-stil-regels">
        <h2>Ligt stil</h2>
        <p>Alleen voor open dossiers en alleen voor de huidige stap. De klok start wanneer de stap begon: bij de vorige stap, bij het aanmaken voor de inschrijving, en bij de eerste subsidiemail voor het toewijzen van een bezoeker. De twee geplande stappen tellen vanaf hun geplande datum.</p>
        <div class="table-responsive">
          <table class="table table-sm tabel-kaarten">
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
                    <td class="text-nowrap fw-semibold fw-md-normal">{stapLabel(r.stap)}</td>
                    <td data-label="Aandacht als">{r.wanneer}</td>
                    <td class="fst-italic" data-label="Tekst in de balk">{r.tekst}</td>
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

const PAGINA_LABEL: Record<Pagina, string> = {
  inschrijving: 'Inschrijving',
  details: 'Op het dossier zelf',
  bezoek: 'Bezoek',
  plan: 'Plan van Aanpak',
  uitvoering: 'Uitvoering',
};

// What a role may edit on a page: everything, nothing, or the labels of the fields and photo slots it may edit.
function rolMag(pagina: Pagina, rol: Bewerker): string {
  const items = [...VELDEN, ...FOTO_SLOTS].filter((x) => x.pagina === pagina);
  const mag = items.filter((x) => x.bewerkers.includes(rol));
  if (!mag.length) return 'Niets';
  if (mag.length === items.length) return 'Alles';
  return [...new Set(mag.map((x) => x.label))].join(', ');
}

export function RechtenUitleg() {
  titel('Uitleg: rechten');
  return (
    <AlleenBeheerder>
      <h1>Uitleg: rechten</h1>
      <p>Wat iemand mag zien en wijzigen hangt af van twee dingen: of die beheerder of klusser is, en bij een klusser welke rol die op het dossier heeft en hoe ver het dossier is. De server controleert dit bij elk verzoek; de app zet velden die je niet mag wijzigen grijs.</p>

      <section class="card card-body mb-3 qa-rechten-beheerder">
        <h2>Beheerders</h2>
        <p>Beheerders zien alle dossiers en mogen alles wijzigen. Alleen beheerders kunnen dossiers aanmaken, het adres en de inschrijving invullen, bezoekers en uitvoerders toewijzen, e-mails versturen, een stap terugdraaien, aandacht uitstellen, dossiers sluiten, heropenen en verwijderen, en de activiteit van een dossier bekijken.</p>
        <p class="mb-2">Ook een beheerder wordt soms tegengehouden:</p>
        <ul class="mb-0">
          <li>Een gesloten dossier is voor iedereen alleen-lezen. Heropen het eerst om iets te wijzigen. Alleen de opleverrapport-mails kun je dan nog versturen.</li>
          <li>Het opleverrapport (de PDF en de mails) bestaat pas als “Werk opgeleverd” is aangetikt.</li>
          <li>“Woningcorporatie heeft het plan goedgekeurd” hoort alleen bij een huurwoning en “Bewoner kiest voor de Klussendienst” alleen bij een koopwoning.</li>
          <li>Aandacht uitstellen kan alleen als het dossier stilligt.</li>
          <li>Je kunt jezelf niet archiveren en je eigen rol niet wijzigen, zodat je jezelf niet kunt buitensluiten.</li>
        </ul>
      </section>

      <section class="card card-body mb-3 qa-rechten-klusser">
        <h2>Klussers</h2>
        <p>Een klusser ziet alleen de dossiers waaraan die is toegewezen, als bezoeker of als uitvoerder. Op die dossiers ziet de klusser alle gegevens van de woning, ook als er niets meer te wijzigen valt. Wat een klusser niet ziet: de activiteit van het dossier, de rode aandacht-balk (wel een herinnering bij de eigen stappen), het e-mailadres en telefoonnummer van andere gebruikers, en het opleverrapport als die niet de uitvoerder is.</p>
        <p>Wat een klusser mag wijzigen hangt af van de rol op dat dossier:</p>
        <ul>
          <li><strong>Bezoeker:</strong> de afspraak, het bezoek en het Plan van Aanpak, tot de bezoeker “Klaar voor controle” aantikt. Daarna is alles alleen-lezen voor de bezoeker.</li>
          <li><strong>Uitvoerder:</strong> de geplande datum en de uitvoering, tot de uitvoerder “Werk opgeleverd” aantikt. Daarna is alles alleen-lezen voor de uitvoerder.</li>
          <li><strong>Beide rollen:</strong> de rechten tellen op en elke rol stopt op zijn eigen moment. Na “Klaar voor controle” kan dezelfde klusser als uitvoerder nog de uitvoering invullen.</li>
        </ul>
        <div class="table-responsive">
          <table class="table table-sm mb-0 tabel-kaarten qa-rechten-tabel">
            <thead>
              <tr>
                <th>Onderdeel</th>
                <th>Bezoeker mag wijzigen</th>
                <th>Uitvoerder mag wijzigen</th>
              </tr>
            </thead>
            <tbody>
              <For each={Object.keys(PAGINA_LABEL) as Pagina[]}>
                {(p) => (
                  <tr class={`qa-rechten-${p}`}>
                    <td class="fw-semibold fw-md-normal">{PAGINA_LABEL[p]}</td>
                    <td data-label="Bezoeker mag wijzigen">{rolMag(p, 'bezoeker')}</td>
                    <td data-label="Uitvoerder mag wijzigen">{rolMag(p, 'uitvoerder')}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card card-body mb-3 qa-rechten-beheer">
        <h2>Het Beheer-menu</h2>
        <p class="mb-0">Alles onder Beheer is alleen voor beheerders: gebruikers, materialen, e-mailsjablonen, feedback, het lege bezoekformulier, alle activiteit en deze uitlegpagina’s. Klussers zien het menu niet, en de server weigert deze gegevens aan hen. Een beheerder kan met “Inloggen als” de app bekijken zoals een klusser hem ziet, met precies diens rechten.</p>
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

  const stappen = (kop: string, qa: string, items: (string | JSX.Element)[]) => (
    <section class="col-md-6">
      <div class={`card card-body h-100 ${qa}`}>
        <h2>{kop}</h2>
        <ol class="mb-0">
          <For each={items}>{(s) => <li>{s}</li>}</For>
        </ol>
      </div>
    </section>
  );
  const iphone = stappen('iPhone (Safari)', 'qa-stappen-iphone', [
    'Open deze pagina in Safari zelf, niet in de browser van je mail-app.',
    'Tik op de Deel-knop (het vierkantje met de pijl omhoog).',
    'Kies “Zet op beginscherm”.',
    'Tik op “Voeg toe”.',
  ]);
  const androidStappen = stappen('Android (Chrome)', 'qa-stappen-android', [
    'Open deze pagina in Chrome, niet in Firefox of een andere browser. Alleen dan openen de links in je e-mails in de app.',
    <>
      Tik in Chrome op het menu <span class='px-2 border rounded'>⋮</span> rechtsboven.
    </>,
    'Kies “App installeren” (of “Toevoegen aan startscherm”).',
  ]);

  return (
    <>
      <h1>App op je telefoon zetten</h1>
      {/* PLACEHOLDER: remove once the screenshots are in. */}
      <div class="alert alert-danger qa-screenshots-ontbreken">Let op: de schermafbeeldingen bij deze stappen zijn nog niet gemaakt. Werk samen met de ontwikkelaar om schermafbeeldingen van het installeren op een iPhone te maken.</div>
      <Show
        when={!geinstalleerd}
        fallback={<div class="alert alert-success qa-al-geinstalleerd">De app staat al op je telefoon.</div>}
      >
        <Show when={!ios && !android}>
          <div class="alert alert-warning qa-open-op-telefoon">Open deze pagina op je telefoon.</div>
        </Show>
        <Show when={prompt()}>
          <button type="button" class="btn btn-primary btn-lg mb-3 qa-installeren" onClick={() => void installeer()}>Installeren</button>
        </Show>
        <div class="row g-3 mb-3">{android ? [androidStappen, iphone] : [iphone, androidStappen]}</div>
        <p class="mb-0">Open daarna de app via het nieuwe icoontje en log nog één keer in met je e-mailadres en code. De app op je beginscherm heeft een eigen login, los van die in je browser.</p>
      </Show>
    </>
  );
}

// The public privacy notice; the reasoning behind it is in docs/privacy.md.
export function Privacy() {
  titel('Privacy');
  return (
    <>
      <h1 class="qa-privacy-titel">Privacy</h1>
      <section class="card card-body mb-3">
        <h2>Wie</h2>
        <p class="mb-0">
          De Ulebelt, Duikerstraat 15 Maatmansweg 3, 7425 NC Deventer, is verantwoordelijk voor de gegevens in deze app. Contact: <a href={`mailto:${ULEBELT_CONTACT_EMAIL}`}>{ULEBELT_CONTACT_EMAIL}</a>.
        </p>
      </section>
      <section class="card card-body mb-3">
        <h2>Waarvoor</h2>
        <p class="mb-0">Ulebelt helpt bewoners hun regenpijpen af te koppelen van het riool. In deze app houden vrijwilligers en beheerders per woning een dossier bij: van de aanvraag via het bezoek en het Plan van Aanpak tot de uitvoering.</p>
      </section>
      <section class="card card-body mb-3">
        <h2>Grondslag</h2>
        <ul class="mb-0">
          <li>Gegevens van bewoners gebruiken we om de afkoppeling uit te voeren waarvoor ze zich hebben aangemeld (uitvoering van een overeenkomst, art. 6 lid 1 sub b AVG).</li>
          <li>Gegevens van vrijwilligers en beheerders gebruiken we om het werk te organiseren en te kunnen laten zien wie wat heeft gedaan (gerechtvaardigd belang, art. 6 lid 1 sub f AVG).</li>
        </ul>
      </section>
      <section class="card card-body mb-3">
        <h2>Welke gegevens</h2>
        <ul class="mb-0">
          <li>Over de bewoner: naam, e-mailadres, telefoonnummer, adres en of de woning huur of koop is.</li>
          <li>Over de woning en de tuin: foto’s, een schets op de kadastrale kaart, metingen en wat er is afgesproken en uitgevoerd.</li>
          <li>Over gebruikers van de app: naam, e-mailadres, telefoonnummer en wanneer ze de app gebruikten. Elke wijziging wordt vastgelegd met wie het deed.</li>
        </ul>
      </section>
      <section class="card card-body mb-3">
        <h2>Wie het ziet</h2>
        <p class="mb-0">Beheerders zien alle dossiers. Een vrijwilliger ziet alleen de dossiers waaraan die is toegewezen. De technisch beheerder van de app kan bij alle gegevens, maar gebruikt dat alleen voor onderhoud en het oplossen van storingen. Het Plan van Aanpak en het opleverrapport gaan naar de bewoner en, bij een huurwoning, naar de woningcorporatie.</p>
      </section>
      <section class="card card-body mb-3">
        <h2>Waar het staat</h2>
        <ul class="mb-0">
          <li>De app en de gegevens staan op een server van Netcup in Duitsland.</li>
          <li>Back-ups staan bij een opslagdienst in de EU.</li>
          <li>E-mails worden verstuurd via Mailgun. Mailgun is een Amerikaans bedrijf, maar wij gebruiken de EU-regio: de e-mails en gegevens blijven in de EU.</li>
          <li>Om de woning in kaart te brengen, zoeken we het adres op bij openbare kaartdiensten, zoals PDOK (Kadaster), BRO, de rioolkaart van de gemeente (ArcGIS) en Google Street View. Die diensten krijgen alleen het adres of de locatie, geen naam of contactgegevens.</li>
        </ul>
      </section>
      <section class="card card-body mb-3">
        <h2>Bewaren en je rechten</h2>
        <p>
          We bewaren een dossier tot vijf jaar nadat het is afgesloten, zodat we vragen over het uitgevoerde werk kunnen beantwoorden. Gegevens van een gebruiker van de app bewaren we tot vijf jaar nadat diens account is gearchiveerd. Daarna verwijderen we de persoonsgegevens.
        </p>
        <p>
          Wil je weten welke gegevens over jou zijn vastgelegd, of wil je ze laten verwijderen of aanpassen? Mail <a href={`mailto:${ULEBELT_CONTACT_EMAIL}`}>{ULEBELT_CONTACT_EMAIL}</a>.
        </p>
        <p class="mb-0">
          Ben je het niet eens met hoe wij met je gegevens omgaan? Dan kun je een klacht indienen bij de <a href="https://autoriteitpersoonsgegevens.nl">Autoriteit Persoonsgegevens</a>.
        </p>
      </section>
    </>
  );
}
