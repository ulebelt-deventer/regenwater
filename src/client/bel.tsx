import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { datumTijd } from '../shared/datum.ts';
import type { Notificaties } from '../shared/types.ts';
import { get, post, zonderNetwerkFout } from './api.ts';
import { Dropdown, probeer } from './ui.tsx';

const INTERVAL_MS = 60_000;

function kop({ ongelezen, totaal }: Notificaties): string {
  if (ongelezen > 0) return `${ongelezen} ongelezen ${ongelezen === 1 ? 'melding' : 'meldingen'}`;
  if (totaal === 1) return '1 melding (gelezen)';
  if (totaal > 0) return `${totaal} meldingen (alle gelezen)`;
  return 'Meldingen';
}

// The bell's state lives here, so the dossier page can mark its meldingen read and the badge follows at once.
const [data, setData] = createSignal<Notificaties>({ ongelezen: 0, totaal: 0, items: [] });
// Bumped when marking starts and ends: a poll that overlaps a mark may predate it, so it is dropped and the mark's own answer stands.
let generatie = 0;

async function laad(): Promise<void> {
  const g = generatie;
  const r = await zonderNetwerkFout(get<Notificaties>('/api/notificaties'));
  if (r && g === generatie) setData(r);
}

// Marks every melding about the dossier read. For beheerders only: a klusser has no bell.
export function leesDossier(dossierId: number): void {
  void probeer(async () => {
    generatie++;
    try {
      const r = await zonderNetwerkFout(post<Notificaties>('/api/notificaties/gelezen', { dossier_id: dossierId }));
      if (r) setData(r);
    } finally {
      generatie++;
    }
  });
}

// The navbar bell: meldingen about the beheerder's own dossiers. Opening the dossier marks its meldingen read; the click does that too, for the dossier already on screen.
export function Bel() {
  const zichtbaar = () => document.visibilityState === 'visible' && void laad();
  onMount(() => {
    void laad();
    const t = setInterval(() => void laad(), INTERVAL_MS);
    document.addEventListener('visibilitychange', zichtbaar);
    onCleanup(() => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', zichtbaar);
    });
  });
  return (
    <Dropdown
      knop={
        <span class="position-relative">
          <i class="bi bi-bell" role="img" aria-label="Meldingen" />
          <Show when={data().ongelezen > 0}>
            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger qa-bel-aantal">{data().ongelezen}</span>
          </Show>
        </span>
      }
      knopClass="btn btn-link nav-link qa-nav-bel"
      class="bel"
      rechts
      vast
    >
      <div class="dropdown-header qa-bel-kop">{kop(data())}</div>
      <div class="bel-lijst">
        <For each={data().items} fallback={<div class="dropdown-item-text text-muted qa-bel-leeg">Nog geen meldingen.</div>}>
          {(n) => (
            // A plain <a>, which the router still navigates: <A> would mark the dossier on screen active, dark green on dark green.
            <a href={`/dossiers/${n.dossier_id}`} class="dropdown-item small d-flex align-items-baseline gap-2 py-2 qa-notificatie" classList={{ 'qa-notificatie-ongelezen': !n.gelezen }} onClick={() => leesDossier(n.dossier_id)}>
              {/* A read melding keeps an invisible dot, so every line starts at the same place. */}
              <span class="d-inline-block p-1 bg-danger rounded-circle flex-shrink-0" classList={{ invisible: n.gelezen }}>
                <Show when={!n.gelezen}><span class="visually-hidden">Ongelezen</span></Show>
              </span>
              <div class="overflow-hidden">
                <div class="regels-2 text-break qa-notificatie-tekst"><span classList={{ 'fw-semibold': !n.gelezen }}>{n.adres}</span>: {n.titel}</div>
                <div class="small text-muted">{datumTijd(n.created_at)}</div>
              </div>
            </a>
          )}
        </For>
      </div>
    </Dropdown>
  );
}
