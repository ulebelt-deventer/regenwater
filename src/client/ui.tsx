import { A } from '@solidjs/router';
import { For, type JSX, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { tijd } from '../shared/datum.ts';
import { ICOON, type IcoonSoort } from '../shared/kaart.ts';
import type { LigtBij } from '../shared/status.ts';
import { isBeheerderNu } from './sessie.ts';

// ---- Pop-up messages ----

interface Melding {
  id: number;
  soort: 'danger' | 'success' | 'warning';
  tekst: string;
  icoon?: string; // a Bootstrap Icons name
}
const [meldingen, setMeldingen] = createSignal<Melding[]>([]);
let meldingNr = 0;

export function melding(soort: Melding['soort'], tekst: string, icoon?: string): number {
  const id = ++meldingNr;
  setMeldingen((m) => [...m, { id, soort, tekst, icoon }]);
  if (soort === 'success') setTimeout(() => sluitMelding(id), 4000);
  return id;
}
export const sluitMelding = (id: number) => setMeldingen((m) => m.filter((x) => x.id !== id));

export function Meldingen() {
  return (
    <div class="meldingen">
      <For each={meldingen()}>
        {(m) => (
          <div class={`alert alert-${m.soort} alert-dismissible shadow-sm qa-melding qa-melding-${m.soort}`} role="alert">
            <Show when={m.icoon}>
              <i class={`bi bi-${m.icoon} me-2`} aria-hidden="true" />
            </Show>
            {m.tekst}
            <button type="button" class="btn-close" aria-label="Sluiten" onClick={() => sluitMelding(m.id)} />
          </div>
        )}
      </For>
    </div>
  );
}

// Runs an action and shows its error as a pop-up; returns whether it succeeded.
export async function probeer(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    melding('danger', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function OnderdeelIcoon(props: { soort: IcoonSoort; class?: string }) {
  return <i class={`bi bi-${ICOON[props.soort].naam} ${props.class ?? ''}`} style={{ color: ICOON[props.soort].kleur }} aria-hidden="true" />;
}

// ---- Modal ----

export function Modal(props: { titel: string; onSluit: () => void; children: JSX.Element; voet?: JSX.Element; groot?: boolean; class?: string }) {
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && props.onSluit();
  onMount(() => document.addEventListener('keydown', esc));
  onCleanup(() => document.removeEventListener('keydown', esc));
  // Only a press that also began on the backdrop closes: the click after a touch tap lands on a pop-up that the tap itself just opened.
  let opAchtergrond = false;
  return (
    <Portal>
      <div
        class={`modal d-block ${props.class ?? ''}`}
        tabindex="-1"
        role="dialog"
        onPointerDown={(e) => (opAchtergrond = e.target === e.currentTarget)}
        onClick={(e) => e.target === e.currentTarget && opAchtergrond && props.onSluit()}
      >
        <div class={`modal-dialog ${props.groot ? 'modal-lg' : ''}`}>
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{props.titel}</h5>
              <button type="button" class="btn-close" aria-label="Sluiten" onClick={() => props.onSluit()} />
            </div>
            <div class="modal-body">{props.children}</div>
            <Show when={props.voet}>
              <div class="modal-footer">{props.voet}</div>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// A question as a pop-up, awaited like window.confirm. Closing it (X, Esc, backdrop) answers null.
export interface Keuze {
  label: string;
  class: string;
  qa: string;
  icoon?: string;
}
interface Vraag {
  titel: string;
  tekst: JSX.Element;
  keuzes: Keuze[];
  annuleren: boolean;
  klaar: (keuze: number | null) => void;
}
const [vraag, setVraag] = createSignal<Vraag | null>(null);

export function bevestig(titel: string, tekst: JSX.Element, opts: { ja?: string; nee?: string; gevaar?: boolean } = {}): Promise<boolean> {
  const keuzes = [
    { label: opts.nee ?? 'Annuleren', class: 'btn-outline-secondary', qa: 'qa-nee' },
    { label: opts.ja ?? 'OK', class: opts.gevaar ? 'btn-danger' : 'btn-primary', qa: 'qa-ja' },
  ];
  return new Promise((klaar) => setVraag({ titel, tekst, keuzes, annuleren: false, klaar: (i) => klaar(i === 1) }));
}

// Like bevestig, but with any number of choices plus an Annuleren link; resolves to the chosen index, or null when cancelled.
export function kies(titel: string, tekst: JSX.Element, keuzes: Keuze[]): Promise<number | null> {
  return new Promise((klaar) => setVraag({ titel, tekst, keuzes, annuleren: true, klaar }));
}

export function Vragen() {
  const antwoord = (keuze: number | null) => {
    const v = vraag()!;
    setVraag(null);
    v.klaar(keuze);
  };
  return (
    <Show when={vraag()}>
      {(v) => (
        <Modal
          titel={v().titel}
          onSluit={() => antwoord(null)}
          class="qa-bevestig"
          voet={
            <>
              <Show when={v().annuleren}>
                <button type="button" class="btn btn-link qa-annuleren" onClick={() => antwoord(null)}>Annuleren</button>
              </Show>
              <For each={v().keuzes}>
                {(k, i) => (
                  <button type="button" class={`btn ${k.class} ${k.qa}`} onClick={() => antwoord(i())}>
                    <Show when={k.icoon}><i class={`bi bi-${k.icoon} me-1`} aria-hidden="true" /></Show>
                    {k.label}
                  </button>
                )}
              </For>
            </>
          }
        >
          {v().tekst}
        </Modal>
      )}
    </Show>
  );
}

// ---- Dropdown (Bootstrap markup, Solid state) ----

// `kiezer`: looks and opens like a select field: the menu covers the field and its search input gets the focus.
// `label` names a caret-only button (knop=""), which must stay :empty for Bootstrap to center the caret.
export function Dropdown(props: { knop: JSX.Element; knopClass?: string; label?: string; rechts?: boolean; children: JSX.Element; class?: string; sluitBijKlik?: boolean; kiezer?: boolean }) {
  const [open, setOpen] = createSignal(false);
  // A left-aligned menu that would run off the right of the screen opens right-aligned instead.
  const [omklappen, setOmklappen] = createSignal(false);
  let el!: HTMLDivElement;
  let menu!: HTMLDivElement;
  // composedPath, not el.contains(e.target): a click that removes its own target (eg a button hidden by the change it makes) is no longer inside el by the time this runs.
  const buiten = (e: MouseEvent) => {
    if (!e.composedPath().includes(el)) setOpen(false);
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
  onMount(() => {
    document.addEventListener('click', buiten);
    document.addEventListener('keydown', esc);
  });
  onCleanup(() => {
    document.removeEventListener('click', buiten);
    document.removeEventListener('keydown', esc);
  });
  const wissel = () => {
    setOmklappen(false);
    setOpen(!open());
    if (open() && !props.rechts) setOmklappen(menu.getBoundingClientRect().right > document.documentElement.clientWidth);
    if (open() && props.kiezer) el.querySelector<HTMLInputElement>('.dropdown-menu input')!.focus();
  };
  return (
    <div class={`dropdown ${props.kiezer ? 'kiezer' : ''} ${props.class ?? ''}`} ref={el}>
      <button type="button" class={`${props.kiezer ? '' : 'dropdown-toggle'} ${props.knopClass ?? 'btn btn-outline-secondary'}`} aria-label={props.label} aria-expanded={open()} onClick={wissel}>
        {props.knop}
      </button>
      {/* Bootstrap positions the menu (incl. -end alignment) only when data-bs-popper is set; "static" is its no-Popper mode. */}
      {/* A reactive `class` would overwrite whatever `classList` set, so every conditional class goes in `classList`. */}
      <div ref={menu} class="dropdown-menu shadow" data-bs-popper="static" classList={{ 'dropdown-menu-end': props.rechts || omklappen(), show: open() }} onClick={() => props.sluitBijKlik !== false && setOpen(false)}>
        {props.children}
      </div>
    </div>
  );
}

// ---- Breadcrumb ----

export function Kruimels(props: { terug: { href: string; label: string }; huidig: string }) {
  return (
    <nav aria-label="Kruimelpad">
      <ol class="breadcrumb small mb-2 qa-kruimels">
        <li class="breadcrumb-item"><A href={props.terug.href} class="qa-kruimel-terug">{props.terug.label}</A></li>
        <li class="breadcrumb-item active" aria-current="page">{props.huidig}</li>
      </ol>
    </nav>
  );
}

// ---- Status labels ----

export function StatusLabel(props: { label: string; ligtBij: LigtBij | null }) {
  return <span class={`bij bij-${props.ligtBij ?? 'gesloten'} qa-status`}>{props.label}</span>;
}

export function AandachtBadge() {
  return <span class="badge badge-aandacht qa-aandacht-badge">aandacht</span>;
}

// The server refuses these pages' API calls for klussers anyway; this just says so instead of showing an error.
export function AlleenBeheerder(props: { children: JSX.Element }) {
  return (
    <Show when={isBeheerderNu()} fallback={<div class="alert alert-warning qa-alleen-beheerder">Deze pagina is alleen voor beheerders.</div>}>
      {props.children}
    </Show>
  );
}

export function Laden() {
  return <div class="text-muted py-4 qa-laden">Laden...</div>;
}

export function Opgeslagen(props: { status: 'opgeslagen' | 'bezig' | 'mislukt'; om: Date | null }) {
  return (
    <span class="qa-opslag-status">
      <Show when={props.status === 'mislukt'}>
        <span class="text-danger fw-semibold qa-opslag-mislukt"><i class="bi bi-wifi-off me-1" aria-hidden="true" />Opslaan mislukt</span>
      </Show>
      <Show when={props.status === 'bezig'}>
        <span class="text-warning qa-opslag-bezig"><span class="spinner-border spinner-border-sm me-1" aria-hidden="true" />Bezig met opslaan...</span>
      </Show>
      <Show when={props.status === 'opgeslagen'}>
        <span class="text-muted qa-opslag-klaar">
          <Show when={props.om}>
            <i class="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
          </Show>
          {props.om ? `Opgeslagen om ${tijd(props.om)}` : 'Slaat automatisch op'}
        </span>
      </Show>
    </span>
  );
}

// Scrolls to an element by id and briefly highlights it.
export function gaNaar(id: string): void {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Geen element met id ${id}`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// Scrolls an element's top to 1rem below the top of the screen at a constant speed over `ms`; scrollIntoView's smooth scroll has no settable speed.
// Each step is 'instant': Bootstrap's `scroll-behavior: smooth` would otherwise animate every step and lag behind.
export function scrollNaar(id: string, ms: number): void {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Geen element met id ${id}`);
  const van = window.scrollY;
  const afstand = el.getBoundingClientRect().top - 16;
  const begin = performance.now();
  const stap = (nu: number) => {
    const t = Math.min(1, (nu - begin) / ms);
    window.scrollTo({ top: van + afstand * t, behavior: 'instant' });
    if (t < 1) requestAnimationFrame(stap);
  };
  requestAnimationFrame(stap);
}

export function titel(t: string): void {
  document.title = `${t} | Ulebelt Regenwater`;
}
