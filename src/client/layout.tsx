import { A, type RouteSectionProps, useLocation, useNavigate } from '@solidjs/router';
import { For, type JSX, Show, createResource, createSignal } from 'solid-js';
import { isOpenbaar, post } from './api.ts';
import { Bel } from './bel.tsx';
import { opgeslagenOm, opslagStatus } from './opslag.ts';
import { UITLEG_PAGINAS } from './paginas/uitleg.tsx';
import { laadOmgeving, laadSessie, nieuwsOngezienNu, omgeving, sessie } from './sessie.ts';
import { Dropdown, Meldingen, Modal, NieuwStip, Opgeslagen, Vragen, melding, probeer } from './ui.tsx';

function NavLink(props: { href: string; children: JSX.Element; class?: string }) {
  return (
    <A href={props.href} class={`nav-link ${props.class ?? ''}`} activeClass="active">
      {props.children}
    </A>
  );
}

function Merk() {
  return (
    <>
      <img src="/icon-192.png" alt="Ulebelt Regenwater" class="logo rounded d-md-none qa-logo-klein" />
      <img src="/ulebelt-logo.svg" alt="Ulebelt" class="logo d-none d-md-block" />
      <span class="wordmark ms-n1 ms-md-0">
        <i class="bi bi-droplet qa-merk-druppel" aria-hidden="true" />
        <span class="d-none d-md-inline ms-1">Regenwater</span>
      </span>
    </>
  );
}

function OmgevingLabel() {
  return (
    <>
      <Show when={omgeving() === 'dev'}>
        <span class="badge text-bg-success qa-omgeving-label">DEV</span>
      </Show>
      <Show when={omgeving() === 'test'}>
        <span class="badge text-bg-warning qa-omgeving-label">TEST</span>
      </Show>
    </>
  );
}

// Logged out: the same bar without the links, since there's nothing to navigate to yet.
function KaleNavbar() {
  return (
    <nav class="topbar no-print qa-navbar-uitgelogd">
      <div class="container-lg gx-2 gx-md-4 d-flex align-items-center gap-1 gap-md-3 py-2">
        <div class="d-flex align-items-center gap-0 gap-md-2 me-md-2">
          <Merk />
        </div>
        <OmgevingLabel />
      </div>
    </nav>
  );
}

function Navbar() {
  const s = () => sessie()!;
  const beheerder = () => s().ik.rol === 'beheerder';
  const uitloggen = async () => {
    await post('/api/auth/logout');
    location.assign('/inloggen');
  };
  return (
    <nav class="topbar no-print qa-navbar">
      <div class="container-lg gx-2 gx-md-4 d-flex flex-wrap align-items-center gap-2 gap-md-3 py-2">
        <div class="d-flex align-items-center gap-1 gap-md-3">
          <A href="/" class="d-flex align-items-center gap-0 gap-md-2 text-decoration-none me-md-2">
            <Merk />
          </A>
          <OmgevingLabel />
        </div>
        <NavLink href="/dossiers" class="qa-nav-dossiers"><i class="bi bi-houses me-1" aria-hidden="true" />{beheerder() ? 'Dossiers' : 'Mijn dossiers'}</NavLink>
        {/* One wrapper pushed right, so the menus stay together whichever of them a phone hides. */}
        <div class="ms-auto d-flex align-items-center gap-2 gap-md-3">
          <Show when={beheerder()}>
            <Bel />
            <Dropdown knop="Beheer" knopClass="btn btn-link nav-link qa-nav-beheer" rechts>
              <A class="dropdown-item qa-nav-gebruikers" href="/gebruikers"><i class="bi bi-people me-2" aria-hidden="true" />Gebruikers</A>
              <A class="dropdown-item" href="/beheer/materialen"><i class="bi bi-hammer me-2" aria-hidden="true" />Materialen</A>
              <A class="dropdown-item qa-nav-normafvoer" href="/beheer/normafvoer"><i class="bi bi-cloud-rain me-2" aria-hidden="true" />Normafvoer</A>
              <A class="dropdown-item qa-nav-woningcorporaties" href="/beheer/woningcorporaties"><i class="bi bi-building me-2" aria-hidden="true" />Woningcorporaties</A>
              <A class="dropdown-item" href="/beheer/sjablonen"><i class="bi bi-envelope me-2" aria-hidden="true" />E-mailsjablonen</A>
              <A class="dropdown-item" href="/beheer/feedback"><i class="bi bi-lightbulb me-2" aria-hidden="true" />Feedback</A>
              <a class="dropdown-item" href="/docs/bezoekformulier-leeg.pdf" target="_blank"><i class="bi bi-file-earmark-arrow-down me-2" aria-hidden="true" />Leeg bezoekformulier (PDF)</a>
              <A class="dropdown-item" href="/beheer/activiteit"><i class="bi bi-clock-history me-2" aria-hidden="true" />Alle activiteit</A>
              <div class="dropdown-divider" />
              {/* The build this page runs: after a reload, the deployed commit. */}
              <div class="dropdown-item-text small text-muted qa-versie">Versie: {import.meta.env.VITE_APP_VERSIE}</div>
            </Dropdown>
          </Show>
          {/* On phones the Account menu has a single Uitleg link instead, to save space; it carries the red dot there. */}
          <Dropdown knop={<><i class="bi bi-question-circle me-1" aria-hidden="true" />Uitleg<Show when={nieuwsOngezienNu()}><NieuwStip /></Show></>} knopClass="btn btn-link nav-link qa-nav-uitleg" class="d-none d-md-block" rechts>
            <For each={UITLEG_PAGINAS}>
              {(u) => <A class="dropdown-item" href={u.href}><i class={`bi ${u.icoon} me-2`} aria-hidden="true" />{u.label}</A>}
            </For>
            <Show when={beheerder()}>
              <div class="dropdown-divider" />
              <A class="dropdown-item qa-nav-nieuws" href="/beheer/nieuw">
                <i class="bi bi-stars me-2" aria-hidden="true" />Wat is er nieuw
                <Show when={nieuwsOngezienNu()}><NieuwStip /></Show>
              </A>
            </Show>
          </Dropdown>
          <Dropdown
            knop={
              <>
                <i class="bi bi-person-circle" role="img" aria-label={s().ik.naam} />
                <span class="d-none d-md-inline ms-2 qa-account-naam">{s().ik.naam}</span>
                <Show when={nieuwsOngezienNu()}><span class="d-md-none"><NieuwStip /></span></Show>
              </>
            }
            knopClass="btn btn-link nav-link qa-nav-account"
            rechts
          >
            <A class="dropdown-item d-md-none qa-account-uitleg" href="/uitleg"><i class="bi bi-question-circle me-2" aria-hidden="true" />Uitleg<Show when={nieuwsOngezienNu()}><NieuwStip /></Show></A>
            <A class="dropdown-item" href="/installeren"><i class="bi bi-phone me-2" aria-hidden="true" />App op je telefoon zetten</A>
            <button type="button" class="dropdown-item text-danger qa-uitloggen" onClick={() => void uitloggen()}><i class="bi bi-box-arrow-right me-2" aria-hidden="true" />Uitloggen</button>
          </Dropdown>
        </div>
      </div>
    </nav>
  );
}

function AlsBanner() {
  const terug = async () => {
    await post('/api/auth/als/stop');
    location.assign('/');
  };
  return (
    <Show when={sessie()!.actor}>
      {(actor) => (
        <div class="als-banner py-2 no-print qa-als-banner">
          <div class="container-lg">
            Je bekijkt de app als {sessie()!.ik.naam}.{' '}
            <button type="button" class="btn btn-link p-0 align-baseline fw-semibold qa-als-stop" onClick={() => void terug()}>
              Terug naar {actor().naam}
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}

function FeedbackModal(props: { onSluit: () => void }) {
  const [tekst, setTekst] = createSignal('');
  const verstuur = async () => {
    const ok = await probeer(() => post('/api/feedback', { tekst: tekst(), scherm: location.pathname + location.search }));
    if (ok) {
      melding('success', 'Bedankt voor je feedback!');
      props.onSluit();
    }
  };
  return (
    <Modal
      titel="Feedback geven"
      onSluit={props.onSluit}
      class="qa-feedback-modal"
      voet={
        <>
          <button type="button" class="btn btn-outline-secondary" onClick={() => props.onSluit()}>Annuleren</button>
          <button type="button" class="btn btn-primary qa-feedback-versturen" onClick={() => void verstuur()}>Versturen</button>
        </>
      }
    >
      <p class="text-muted small">Wat werkt er niet, wat is onduidelijk, of wat zou je graag anders zien? De beheerders en de ontwikkelaar krijgen je bericht, met de pagina waar je nu bent.</p>
      <textarea ref={(el) => requestAnimationFrame(() => el.focus())} class="form-control qa-feedback-tekst" rows="6" value={tekst()} onInput={(e) => setTekst(e.currentTarget.value)} />
    </Modal>
  );
}

function Footer() {
  const [feedback, setFeedback] = createSignal(false);
  return (
    <footer class="border-top mt-5 py-3 small text-muted">
      <div class="container-lg d-flex gap-3">
        <A href="/privacy" class="link-secondary">Privacy</A>
        <Show when={sessie()}>
          <button type="button" class="btn btn-link btn-inline link-secondary qa-feedback" onClick={() => setFeedback(true)}>Feedback geven</button>
        </Show>
      </div>
      <Show when={feedback()}>
        <FeedbackModal onSluit={() => setFeedback(false)} />
      </Show>
    </footer>
  );
}

export function Layout(props: RouteSectionProps) {
  const loc = useLocation();
  const navigate = useNavigate();
  const openbaar = () => isOpenbaar(loc.pathname);
  const [geladen] = createResource(async () => {
    const [s] = await Promise.all([laadSessie(), laadOmgeving()]);
    if (!s && !openbaar()) navigate('/inloggen', { replace: true });
    return true;
  });
  return (
    <Show when={geladen()}>
      <Show when={sessie()} fallback={<KaleNavbar />}>
        <Navbar />
        <AlsBanner />
      </Show>
      <main class="container-lg py-3">
        <Show when={sessie() || openbaar()}>{props.children}</Show>
      </main>
      <Footer />
      <Show when={sessie() && /^\/dossiers\/\d+/.test(loc.pathname)}>
        <div class="opslag no-print">
          <Opgeslagen status={opslagStatus()} om={opgeslagenOm()} />
        </div>
      </Show>
      <Meldingen />
      <Vragen />
    </Show>
  );
}
