import { A, type RouteSectionProps, useLocation, useNavigate } from '@solidjs/router';
import { type JSX, Show, createResource, createSignal } from 'solid-js';
import { post } from './api.ts';
import { opgeslagenOm, opslagStatus } from './opslag.ts';
import { laadSessie, sessie } from './sessie.ts';
import { Dropdown, Meldingen, Modal, Opgeslagen, Vragen, melding, probeer } from './ui.tsx';

function NavLink(props: { href: string; end?: boolean; children: JSX.Element; class?: string }) {
  return (
    <A href={props.href} end={props.end} class={`nav-link ${props.class ?? ''}`} activeClass="active">
      {props.children}
    </A>
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
    <nav class="topbar no-print">
      <div class="container-lg d-flex flex-wrap align-items-center gap-3 py-2">
        <A href="/" class="d-flex align-items-center gap-2 text-decoration-none me-2">
          <img src="/icon-192.png" alt="Ulebelt Regenwater" class="logo rounded d-md-none qa-logo-klein" />
          <img src="/ulebelt-logo.svg" alt="Ulebelt" class="logo d-none d-md-block" />
          <span class="wordmark d-none d-md-inline">Regenwater</span>
        </A>
        <Show when={beheerder()}>
          <NavLink href="/" end class="d-none d-md-block qa-nav-overzicht">Overzicht</NavLink>
        </Show>
        <NavLink href="/dossiers" class="qa-nav-dossiers">{beheerder() ? 'Dossiers' : 'Mijn dossiers'}</NavLink>
        <Show when={beheerder()}>
          <Dropdown knop="Beheer" knopClass="btn btn-link nav-link qa-nav-beheer">
            <A class="dropdown-item qa-nav-gebruikers" href="/gebruikers">Gebruikers</A>
            <A class="dropdown-item" href="/beheer/materialen">Materialen</A>
            <A class="dropdown-item" href="/beheer/sjablonen">E-mailsjablonen</A>
            <A class="dropdown-item" href="/beheer/feedback">Feedback</A>
            <a class="dropdown-item" href="/docs/bezoekformulier-leeg.pdf" target="_blank"><i class="bi bi-file-earmark-arrow-down me-2" aria-hidden="true" />Leeg bezoekformulier (PDF)</a>
            <A class="dropdown-item" href="/beheer/activiteit">Alle activiteit</A>
            <div class="dropdown-divider" />
            <A class="dropdown-item" href="/uitleg/statussen">Uitleg: statussen</A>
            <A class="dropdown-item" href="/uitleg/aandacht">Uitleg: aandacht</A>
          </Dropdown>
        </Show>
        <Dropdown
          knop={
            <>
              <i class="bi bi-person-circle" role="img" aria-label={s().ik.naam} />
              <span class="d-none d-md-inline ms-2 qa-account-naam">{s().ik.naam}</span>
            </>
          }
          knopClass="btn btn-link nav-link qa-nav-account"
          class="ms-auto"
          rechts
        >
          <A class="dropdown-item" href="/installeren"><i class="bi bi-phone me-2" aria-hidden="true" />App op je telefoon zetten</A>
          <button type="button" class="dropdown-item qa-uitloggen" onClick={() => void uitloggen()}><i class="bi bi-box-arrow-right me-2" aria-hidden="true" />Uitloggen</button>
        </Dropdown>
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
      <textarea class="form-control qa-feedback-tekst" rows="6" value={tekst()} onInput={(e) => setTekst(e.currentTarget.value)} />
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

const OPENBAAR = ['/inloggen', '/privacy'];

export function Layout(props: RouteSectionProps) {
  const loc = useLocation();
  const navigate = useNavigate();
  const openbaar = () => OPENBAAR.some((p) => loc.pathname.startsWith(p));
  const [geladen] = createResource(async () => {
    const s = await laadSessie();
    if (!s && !openbaar()) navigate('/inloggen', { replace: true });
    return true;
  });
  return (
    <Show when={geladen()}>
      <Show when={sessie()}>
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
