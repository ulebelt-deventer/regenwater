import { For, type JSX, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { tijd } from '../shared/datum.ts';
import type { LigtBij } from '../shared/status.ts';
import { isBeheerderNu } from './sessie.ts';

// ---- Pop-up messages ----

interface Melding {
  id: number;
  soort: 'danger' | 'success' | 'warning';
  tekst: string;
}
const [meldingen, setMeldingen] = createSignal<Melding[]>([]);
let meldingNr = 0;

export function melding(soort: Melding['soort'], tekst: string): void {
  const id = ++meldingNr;
  setMeldingen((m) => [...m, { id, soort, tekst }]);
  if (soort === 'success') setTimeout(() => sluitMelding(id), 4000);
}
const sluitMelding = (id: number) => setMeldingen((m) => m.filter((x) => x.id !== id));

export function Meldingen() {
  return (
    <div class="meldingen">
      <For each={meldingen()}>
        {(m) => (
          <div class={`alert alert-${m.soort} alert-dismissible shadow-sm qa-melding qa-melding-${m.soort}`} role="alert">
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

// ---- Modal ----

export function Modal(props: { titel: string; onSluit: () => void; children: JSX.Element; voet?: JSX.Element; groot?: boolean; class?: string }) {
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && props.onSluit();
  onMount(() => document.addEventListener('keydown', esc));
  onCleanup(() => document.removeEventListener('keydown', esc));
  return (
    <Portal>
      <div class={`modal d-block ${props.class ?? ''}`} tabindex="-1" role="dialog" onClick={(e) => e.target === e.currentTarget && props.onSluit()}>
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

// A yes/no question as a pop-up, awaited like window.confirm.
interface Vraag {
  titel: string;
  tekst: JSX.Element;
  ja: string;
  nee: string;
  gevaar: boolean;
  klaar: (ja: boolean) => void;
}
const [vraag, setVraag] = createSignal<Vraag | null>(null);

export function bevestig(titel: string, tekst: JSX.Element, opts: { ja?: string; nee?: string; gevaar?: boolean } = {}): Promise<boolean> {
  return new Promise((klaar) => setVraag({ titel, tekst, ja: opts.ja ?? 'OK', nee: opts.nee ?? 'Annuleren', gevaar: opts.gevaar ?? false, klaar }));
}

export function Vragen() {
  const antwoord = (ja: boolean) => {
    const v = vraag()!;
    setVraag(null);
    v.klaar(ja);
  };
  return (
    <Show when={vraag()}>
      {(v) => (
        <Modal
          titel={v().titel}
          onSluit={() => antwoord(false)}
          class="qa-bevestig"
          voet={
            <>
              <button type="button" class="btn btn-outline-secondary qa-nee" onClick={() => antwoord(false)}>{v().nee}</button>
              <button type="button" class={`btn ${v().gevaar ? 'btn-danger' : 'btn-primary'} qa-ja`} onClick={() => antwoord(true)}>{v().ja}</button>
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

export function Dropdown(props: { knop: JSX.Element; knopClass?: string; menuClass?: string; rechts?: boolean; children: JSX.Element; class?: string; sluitBijKlik?: boolean }) {
  const [open, setOpen] = createSignal(false);
  let el!: HTMLDivElement;
  const buiten = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) setOpen(false);
  };
  onMount(() => document.addEventListener('click', buiten));
  onCleanup(() => document.removeEventListener('click', buiten));
  return (
    <div class={`dropdown ${props.class ?? ''}`} ref={el}>
      <button type="button" class={`dropdown-toggle ${props.knopClass ?? 'btn btn-outline-secondary'}`} aria-expanded={open()} onClick={() => setOpen(!open())}>
        {props.knop}
      </button>
      {/* Bootstrap positions the menu (incl. -end alignment) only when data-bs-popper is set; "static" is its no-Popper mode. */}
      <div class={`dropdown-menu ${props.rechts ? 'dropdown-menu-end' : ''} ${props.menuClass ?? ''}`} data-bs-popper="static" classList={{ show: open() }} onClick={() => props.sluitBijKlik !== false && setOpen(false)}>
        {props.children}
      </div>
    </div>
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
        <span class="text-danger fw-semibold qa-opslag-mislukt">Opslaan mislukt</span>
      </Show>
      <Show when={props.status === 'bezig'}>
        <span class="text-warning qa-opslag-bezig">Bezig met opslaan...</span>
      </Show>
      <Show when={props.status === 'opgeslagen'}>
        <span class="text-muted qa-opslag-klaar">{props.om ? `Opgeslagen om ${tijd(props.om)}` : 'Wijzigingen worden automatisch opgeslagen'}</span>
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

export function titel(t: string): void {
  document.title = `${t} | Ulebelt Regenwater`;
}
