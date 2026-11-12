import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { datumTijd } from '../shared/datum.ts';
import type { Notificaties } from '../shared/types.ts';
import { get, isNetwerkFout, post } from './api.ts';
import { Dropdown, probeer } from './ui.tsx';

const INTERVAL_MS = 60_000;

// The navbar bell: meldingen about the beheerder's own dossiers. Opening one marks every melding about that dossier read.
export function Bel() {
  const [data, setData] = createSignal<Notificaties>({ ongelezen: 0, items: [] });
  // Bumped when marking starts and ends: a poll that overlaps a mark may predate it, so it is dropped and the mark's own answer stands.
  let generatie = 0;
  const laad = async () => {
    const g = generatie;
    const r = await get<Notificaties>('/api/notificaties').catch((e: unknown) => {
      if (isNetwerkFout(e)) return null;
      throw e;
    });
    if (r && g === generatie) setData(r);
  };
  const lees = (dossierId: number) =>
    void probeer(async () => {
      generatie++;
      try {
        setData(await post<Notificaties>('/api/notificaties/gelezen', { dossier_id: dossierId }));
      } finally {
        generatie++;
      }
    });
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
      <div class="dropdown-header">Meldingen</div>
      <div class="bel-lijst">
        <For each={data().items} fallback={<div class="dropdown-item-text text-muted qa-bel-leeg">Nog geen meldingen.</div>}>
          {(n) => (
            // A plain <a>, which the router still navigates: <A> would mark the dossier on screen active, dark green on dark green.
            <a href={`/dossiers/${n.dossier_id}`} class="dropdown-item text-wrap py-2 qa-notificatie" classList={{ 'qa-notificatie-ongelezen': !n.gelezen }} onClick={() => lees(n.dossier_id)}>
              <div class="d-flex align-items-baseline gap-2">
                <span class={n.gelezen ? '' : 'fw-semibold'}>{n.adres}</span>
                <Show when={!n.gelezen}>
                  <span class="d-inline-block p-1 bg-danger rounded-circle flex-shrink-0"><span class="visually-hidden">Ongelezen</span></span>
                </Show>
              </div>
              <div>{n.titel}</div>
              <Show when={n.detail}>{(d) => <div class="small text-muted">{d()}</div>}</Show>
              <div class="small text-muted">{datumTijd(n.created_at)}</div>
            </a>
          )}
        </For>
      </div>
    </Dropdown>
  );
}
