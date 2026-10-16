// Alle activiteit across the app (admin): filters live in the URL, so "Alle activiteit van {naam}" can link here.
import { A, useSearchParams } from '@solidjs/router';
import { For, Show, createEffect, createSignal, on } from 'solid-js';
import { adresTekst } from '../../shared/status.ts';
import type { Adres } from '../../shared/types.ts';
import { ActiviteitLijst, type AuditItem, TYPE_LABEL } from '../activiteit.tsx';
import { get, query } from '../api.ts';
import { naamUit } from '../dossier/activiteit.tsx';
import { AlleenBeheerder, Laden, probeer, titel } from '../ui.tsx';

interface Pagina {
  items: AuditItem[];
  volgende: number | null;
  adressen: Record<string, Adres | null>;
  gebruikers: Record<string, string>;
  types: string[];
}

export function Activiteit() {
  titel('Alle activiteit');
  return (
    <AlleenBeheerder>
      <Inhoud />
    </AlleenBeheerder>
  );
}

function Inhoud() {
  const [params, setParams] = useSearchParams();
  const param = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '');
  const [items, setItems] = createSignal<AuditItem[]>([]);
  const [laatste, setLaatste] = createSignal<Pagina | null>(null);
  const [adressen, setAdressen] = createSignal<Record<string, Adres | null>>({});
  const [bezig, setBezig] = createSignal(false);
  const [dossierInvoer, setDossierInvoer] = createSignal(param('dossier'));
  let aanvraag = 0;

  // A filter change starts over; an answer for an older filter is dropped.
  const laad = async (voor: number | null) => {
    const nr = ++aanvraag;
    setBezig(true);
    await probeer(async () => {
      const p = await get<Pagina>(`/api/activiteit${query({ actor: param('actor'), type: param('type'), dossier: param('dossier'), voor })}`);
      if (nr !== aanvraag) return;
      setItems((oud) => (voor === null ? p.items : [...oud, ...p.items]));
      setAdressen((oud) => (voor === null ? p.adressen : { ...oud, ...p.adressen }));
      setLaatste(p);
    });
    if (nr === aanvraag) setBezig(false);
  };
  createEffect(
    on(
      () => [param('actor'), param('type'), param('dossier')],
      () => {
        setDossierInvoer(param('dossier'));
        void laad(null);
      },
    ),
  );

  const naam = () => naamUit(new Map(Object.entries(laatste()!.gebruikers).map(([id, n]) => [Number(id), n])));
  const gebruikers = () => Object.entries(laatste()!.gebruikers).sort((a, b) => a[1].localeCompare(b[1]));
  const dossierCel = (i: AuditItem) => {
    const id = i.dossier_id;
    if (id === null) return <span class="text-muted">--</span>;
    const a = adressen()[id];
    return a ? <A href={`/dossiers/${id}`}>{adresTekst(a)}</A> : a === null ? <A href={`/dossiers/${id}`}>Dossier {id} (geen adres)</A> : <span class="text-muted">Dossier {id} (verwijderd)</span>;
  };
  const zetDossier = () => {
    const v = dossierInvoer().trim();
    setParams({ dossier: /^\d+$/.test(v) ? v : undefined });
  };

  return (
    <>
      <h1 class="mb-3">Alle activiteit</h1>
      <Show when={laatste()} fallback={<Laden />}>
        <div class="row g-2 mb-3 qa-filters">
          <div class="col-12 col-md-4">
            <select class="form-select qa-filter-actor" value={param('actor')} onChange={(e) => setParams({ actor: e.currentTarget.value || undefined })}>
              <option value="">Iedereen</option>
              <For each={gebruikers()}>{([id, n]) => <option value={id}>{n}</option>}</For>
            </select>
          </div>
          <div class="col-12 col-md-4">
            <select class="form-select qa-filter-type" value={param('type')} onChange={(e) => setParams({ type: e.currentTarget.value || undefined })}>
              <option value="">Alle soorten</option>
              <For each={laatste()!.types}>{(t) => <option value={t}>{TYPE_LABEL[t] ?? t}</option>}</For>
            </select>
          </div>
          <div class="col-12 col-md-4">
            <form
              class="input-group"
              onSubmit={(e) => {
                e.preventDefault();
                zetDossier();
              }}
            >
              <input class="form-control qa-filter-dossier" inputmode="numeric" placeholder="Dossiernummer" value={dossierInvoer()} onInput={(e) => setDossierInvoer(e.currentTarget.value)} />
              <button type="submit" class="btn btn-outline-secondary">Filter</button>
            </form>
          </div>
        </div>
        <Show when={param('actor') || param('type') || param('dossier')}>
          <div class="mb-2">
            <A href="/beheer/activiteit" class="small qa-filters-wissen">Filters wissen</A>
          </div>
        </Show>
        <Show when={items().length} fallback={<div class="text-muted qa-geen-activiteit">{bezig() ? 'Laden...' : 'Geen activiteit gevonden.'}</div>}>
          <ActiviteitLijst items={items()} naam={naam()} adres={dossierCel} />
        </Show>
        <Show when={laatste()!.volgende}>
          {(v) => (
            <button type="button" class="btn btn-outline-secondary qa-meer" disabled={bezig()} onClick={() => void laad(v())}>Meer laden</button>
          )}
        </Show>
      </Show>
    </>
  );
}
