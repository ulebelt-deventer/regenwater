import { A } from '@solidjs/router';
import { For, type JSX, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { tijd } from '../shared/datum.ts';
import { ICOON, type IcoonSoort } from '../shared/kaart.ts';
import type { LigtBij } from '../shared/status.ts';
import { isBeheerderNu } from './sessie.ts';
import { nieuweVersie, verbergNieuweVersie } from './versie.ts';

// ---- Pop-up messages ----

interface Melding {
  id: number;
  soort: 'danger' | 'success' | 'warning';
  tekst: string;
  icoon?: string; // a Bootstrap Icons name
}
const [meldingen, setMeldingen] = createSignal<Melding[]>([]);
const [vervagend, setVervagend] = createSignal<number[]>([]);
let meldingNr = 0;

// A success message fades out after 3s, over the .melding-weg transition.
export function melding(soort: Melding['soort'], tekst: string, icoon?: string): number {
  const id = ++meldingNr;
  setMeldingen((m) => [...m, { id, soort, tekst, icoon }]);
  if (soort === 'success') {
    setTimeout(() => {
      setVervagend((v) => [...v, id]);
      setTimeout(() => sluitMelding(id), 250);
    }, 3000);
  }
  return id;
}
export const sluitMelding = (id: number) => {
  setMeldingen((m) => m.filter((x) => x.id !== id));
  setVervagend((v) => v.filter((x) => x !== id));
};

export function Meldingen() {
  return (
    <div class="meldingen">
      {/* Unsent edits survive the reload: the autosave queue lives in localStorage and IndexedDB. */}
      <Show when={nieuweVersie()}>
        <div class="alert alert-info alert-dismissible shadow-sm d-flex align-items-center gap-2 qa-nieuwe-versie" role="alert">
          <i class="bi bi-arrow-clockwise" aria-hidden="true" />
          <span class="me-auto">Er is een nieuwe versie van de app.</span>
          <button type="button" class="btn btn-sm btn-primary qa-vernieuwen" onClick={() => location.reload()}>Vernieuwen</button>
          <button type="button" class="btn-close qa-nieuwe-versie-sluiten" aria-label="Sluiten" onClick={verbergNieuweVersie} />
        </div>
      </Show>
      <For each={meldingen()}>
        {(m) => (
          <div class={`alert alert-${m.soort} alert-dismissible shadow-sm qa-melding qa-melding-${m.soort} ${vervagend().includes(m.id) ? 'melding-weg' : ''}`} role="alert">
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
// `vast`: a right-aligned menu that is position: fixed, so an overflow ancestor (.table-responsive) can't clip it; it follows its button on scroll.
export function Dropdown(props: { knop: JSX.Element; knopClass?: string; label?: string; rechts?: boolean; children: JSX.Element; class?: string; sluitBijKlik?: boolean; kiezer?: boolean; vast?: boolean }) {
  const [open, setOpen] = createSignal(false);
  // A left-aligned menu that would run off the right of the screen opens right-aligned instead.
  const [omklappen, setOmklappen] = createSignal(false);
  const [plek, setPlek] = createSignal<JSX.CSSProperties>({});
  let el!: HTMLDivElement;
  let knop!: HTMLButtonElement;
  let menu!: HTMLDivElement;
  // composedPath, not el.contains(e.target): a click that removes its own target (eg a button hidden by the change it makes) is no longer inside el by the time this runs.
  const buiten = (e: MouseEvent) => {
    if (!e.composedPath().includes(el)) setOpen(false);
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
  // Below the button, or above it when it doesn't fit below.
  const plaats = () => {
    if (!open()) return;
    const r = knop.getBoundingClientRect();
    const top = r.bottom + menu.offsetHeight > window.innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom;
    setPlek({ position: 'fixed', top: `${top}px`, right: `${document.documentElement.clientWidth - r.right}px`, left: 'auto' });
  };
  onMount(() => {
    document.addEventListener('click', buiten);
    document.addEventListener('keydown', esc);
    if (props.vast) document.addEventListener('scroll', plaats, true);
  });
  onCleanup(() => {
    document.removeEventListener('click', buiten);
    document.removeEventListener('keydown', esc);
    document.removeEventListener('scroll', plaats, true);
  });
  const wissel = () => {
    setOmklappen(false);
    setOpen(!open());
    if (props.vast) plaats();
    if (open() && !props.rechts && !props.vast) setOmklappen(menu.getBoundingClientRect().right > document.documentElement.clientWidth);
    if (open() && props.kiezer) el.querySelector<HTMLInputElement>('.dropdown-menu input')!.focus();
  };
  return (
    <div class={`dropdown ${props.kiezer ? 'kiezer' : ''} ${props.class ?? ''}`} ref={el}>
      <button type="button" class={`${props.kiezer ? '' : 'dropdown-toggle'} ${props.knopClass ?? 'btn btn-outline-secondary'}`} aria-label={props.label} aria-expanded={open()} onClick={wissel} ref={knop}>
        {props.knop}
      </button>
      {/* Bootstrap positions the menu (incl. -end alignment) only when data-bs-popper is set; "static" is its no-Popper mode. */}
      {/* A reactive `class` would overwrite whatever `classList` set, so every conditional class goes in `classList`. */}
      <div ref={menu} class="dropdown-menu shadow" data-bs-popper="static" classList={{ 'dropdown-menu-end': props.rechts || omklappen(), show: open() }} style={plek()} onClick={() => props.sluitBijKlik !== false && setOpen(false)}>
        {props.children}
      </div>
    </div>
  );
}

// ---- Tooltip ----

// A tooltip in Bootstrap's markup, placed by hand (no Popper): `ref={tip('...')}`. Shows on mouse hover and keyboard focus; a tap
// toggles it on an element that does nothing else, so touch screens get it too. It sits above the element, below it when there's no room, and stays on screen.
export function tip(tekst: string | (() => string)): (el: HTMLElement) => void {
  return (el) => {
    let bel: HTMLDivElement | null = null;
    const toon = () => {
      if (bel) return;
      bel = document.createElement('div');
      bel.className = 'tooltip show qa-tip';
      bel.setAttribute('role', 'tooltip');
      const pijl = bel.appendChild(document.createElement('div'));
      pijl.className = 'tooltip-arrow';
      pijl.style.position = 'absolute';
      bel.appendChild(document.createElement('div')).className = 'tooltip-inner';
      bel.lastElementChild!.textContent = typeof tekst === 'function' ? tekst() : tekst;
      // Fixed (and the arrow absolute) before measuring: as a block in the body it would measure the full page width.
      Object.assign(bel.style, { position: 'fixed', left: '0', top: '0' });
      document.body.appendChild(bel);
      const r = el.getBoundingClientRect();
      const b = bel.getBoundingClientRect();
      // The arrow hangs outside the box, between it and the element.
      const pijlHoogte = parseFloat(getComputedStyle(bel).getPropertyValue('--bs-tooltip-arrow-height')) * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const boven = r.top - b.height - pijlHoogte >= 0;
      bel.classList.add(boven ? 'bs-tooltip-top' : 'bs-tooltip-bottom');
      const links = Math.max(4, Math.min(r.left + r.width / 2 - b.width / 2, document.documentElement.clientWidth - b.width - 4));
      Object.assign(bel.style, { left: `${links}px`, top: `${boven ? r.top - b.height - pijlHoogte : r.bottom + pijlHoogte}px` });
      pijl.style.left = `${r.left + r.width / 2 - links - pijl.offsetWidth / 2}px`;
    };
    const verberg = () => {
      bel?.remove();
      bel = null;
    };
    // A touch also "leaves" when the finger lifts, and focuses a tapped button; only a mouse and the keyboard count for those.
    const binnen = (e: PointerEvent) => e.pointerType === 'mouse' && toon();
    const weg = (e: PointerEvent) => e.pointerType === 'mouse' && verberg();
    const tik = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !el.matches('a, button')) (bel ? verberg : toon)();
    };
    const focus = () => el.matches(':focus-visible') && toon();
    const buiten = (e: Event) => !el.contains(e.target as Node) && verberg();
    el.addEventListener('pointerenter', binnen);
    el.addEventListener('pointerleave', weg);
    el.addEventListener('pointerup', tik);
    el.addEventListener('focus', focus);
    el.addEventListener('blur', verberg);
    document.addEventListener('pointerdown', buiten);
    window.addEventListener('scroll', verberg, true);
    onCleanup(() => {
      verberg();
      document.removeEventListener('pointerdown', buiten);
      window.removeEventListener('scroll', verberg, true);
    });
  };
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

// Scrolls to an element by id and briefly highlights it, first opening a collapsed details (eg a regenpijp block) around it.
export function gaNaar(id: string): void {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Geen element met id ${id}`);
  const details = el.closest('details');
  if (details) details.open = true;
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
