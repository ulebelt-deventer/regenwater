// Gebruikers list and one gebruiker's page (admin).
import { A, useNavigate, useParams } from '@solidjs/router';
import { For, Match, Show, Switch, createEffect, createResource, createSignal } from 'solid-js';
import { datum, kortDatum } from '../../shared/datum.ts';
import type { Gebruiker } from '../../shared/types.ts';
import { ApiFout, get, post, query } from '../api.ts';
import { GebruikerForm } from '../gebruikerform.tsx';
import { ik } from '../sessie.ts';
import { AlleenBeheerder, Dropdown, Laden, StatusLabel, bevestig, melding, probeer, titel } from '../ui.tsx';
import { type LijstRij, OpdrachtBadge } from './dossiers.tsx';
import { type GebruikerRij, RolBadge } from './overzicht.tsx';

export function Gebruikers() {
  titel('Gebruikers');
  return (
    <AlleenBeheerder>
      <Lijst />
    </AlleenBeheerder>
  );
}

function Lijst() {
  const navigate = useNavigate();
  const [gearchiveerd, setGearchiveerd] = createSignal(false);
  const [nieuw, setNieuw] = createSignal(false);
  // A source of `false` would skip the fetch, so the flag goes in as 0/1.
  const [data, { refetch }] = createResource(() => Number(gearchiveerd()), (g) => get<{ gebruikers: GebruikerRij[] }>(`/api/gebruikers${query({ gearchiveerd: g || null })}`));

  return (
    <>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 class="h3 mb-0 me-auto">Gebruikers</h1>
        <button type="button" class="btn btn-primary qa-nieuwe-gebruiker" onClick={() => setNieuw(true)}><i class="bi bi-plus-lg me-1" aria-hidden="true" />Nieuwe<span class="d-none d-sm-inline"> gebruiker</span></button>
      </div>
      <div class="form-check mb-3">
        <input id="toon-gearchiveerd" type="checkbox" class="form-check-input qa-toon-gearchiveerd" checked={gearchiveerd()} onChange={(e) => setGearchiveerd(e.currentTarget.checked)} />
        <label for="toon-gearchiveerd" class="form-check-label">Toon gearchiveerde gebruikers</label>
      </div>
      <Show when={data()} fallback={<Laden />}>
        {(d) => (
          <div class="table-responsive">
            <table class="table table-hover align-middle tabel-kaarten qa-gebruikers">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>E-mail</th>
                  <th>Telefoon</th>
                  <th>Rol</th>
                  <th>Laatst actief</th>
                  <th class="text-end">Open dossiers</th>
                  <th class="text-end">Gesloten dossiers</th>
                </tr>
              </thead>
              <tbody>
                <For each={d().gebruikers}>
                  {(g) => (
                    <tr class={`row-link qa-gebruiker qa-gebruiker-${g.id}`} classList={{ 'text-muted': !!g.archived_at }} onClick={() => navigate(`/gebruikers/${g.id}`)}>
                      <td>
                        <A href={`/gebruikers/${g.id}`} class="text-reset text-decoration-none fw-semibold">{g.naam}</A>
                        <span class="d-md-none ms-2"><RolBadge rol={g.rol} /></span>
                        <Show when={g.archived_at}>
                          <span class="badge text-bg-secondary ms-2">Gearchiveerd</span>
                        </Show>
                      </td>
                      <td class="text-break">{g.email}</td>
                      <td class="text-nowrap">{g.telefoon ?? ''}</td>
                      <td class="d-none d-md-table-cell"><RolBadge rol={g.rol} /></td>
                      <td class="text-nowrap d-none d-md-table-cell">{g.last_active_at ? datum(g.last_active_at) : '--'}</td>
                      <td class="text-end" data-label="Open dossiers">{g.open}</td>
                      <td class="text-end d-none d-md-table-cell">{g.gesloten}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </Show>
      <Show when={nieuw()}>
        <GebruikerForm
          onSluit={() => setNieuw(false)}
          onOpgeslagen={(g) => {
            setNieuw(false);
            melding('success', `${g.naam} is toegevoegd.`);
            void refetch();
          }}
        />
      </Show>
    </>
  );
}

interface GebruikerData {
  gebruiker: Gebruiker;
  dossiers: LijstRij[];
}

export function GebruikerPagina() {
  return (
    <AlleenBeheerder>
      <Pagina />
    </AlleenBeheerder>
  );
}

function Pagina() {
  const params = useParams();
  const navigate = useNavigate();
  const [data, { mutate }] = createResource(() => Number(params.id), (id) => get<GebruikerData>(`/api/gebruikers/${id}`));
  const [bewerken, setBewerken] = createSignal(false);
  createEffect(() => {
    if (data.state === 'ready') titel(data().gebruiker.naam);
  });

  const zet = (g: Gebruiker) => mutate((d) => ({ ...d!, gebruiker: g }));
  const archiveren = async (g: Gebruiker) => {
    const ja = await bevestig(
      `${g.naam} archiveren?`,
      <>
        <p>{g.naam} wordt overal uitgelogd, kan niet meer inloggen en staat niet meer in de keuzelijsten voor bezoeker en uitvoerder. Op de dossiers waar {g.naam} aan werkte blijft de naam staan.</p>
        <p class="mb-0">Open dossiers die nog aan {g.naam} zijn toegewezen krijgen aandacht (Klopt niet) tot je ze opnieuw toewijst. Dearchiveren geeft de toegang terug.</p>
      </>,
      { ja: 'Archiveren', gevaar: true },
    );
    if (!ja) return;
    await probeer(async () => zet((await post<{ gebruiker: Gebruiker }>(`/api/gebruikers/${g.id}/archiveren`)).gebruiker));
  };
  const dearchiveren = async (g: Gebruiker) => {
    await probeer(async () => zet((await post<{ gebruiker: Gebruiker }>(`/api/gebruikers/${g.id}/dearchiveren`)).gebruiker));
  };
  const inloggenAls = async (g: Gebruiker) => {
    const ja = await bevestig(
      `Inloggen als ${g.naam}?`,
      <>
        <p>Je ziet de app dan precies zoals {g.naam} hem ziet. Wat je in die tijd doet, wordt vastgelegd als jouw actie namens {g.naam}.</p>
        <p class="mb-0">Gebruik dit alleen om een probleem te onderzoeken. Via de rode balk bovenaan ga je terug naar je eigen account.</p>
      </>,
      { ja: 'Inloggen als ' + g.naam },
    );
    if (!ja) return;
    if (await probeer(() => post(`/api/auth/als/${g.id}`))) location.assign('/dossiers');
  };

  return (
    <Switch fallback={<Laden />}>
      <Match when={data.state === 'errored'}>
        <div class="alert alert-danger qa-gebruiker-fout">{data.error instanceof ApiFout && data.error.status === 404 ? 'Deze gebruiker bestaat niet.' : (data.error as Error).message}</div>
      </Match>
      <Match when={data.state === 'ready' ? data() : null}>
        {(d) => {
          const g = () => d().gebruiker;
          const zelf = () => g().id === ik().id;
          return (
            <>
              <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <h1 class="h3 mb-0 qa-gebruiker-naam">{g().naam}</h1>
                <RolBadge rol={g().rol} />
                <Show when={g().archived_at}>
                  <span class="badge text-bg-secondary qa-gearchiveerd">Gearchiveerd</span>
                </Show>
                <Dropdown knop={<span class="visually-hidden">Acties</span>} knopClass="btn btn-outline-primary qa-gebruiker-menu" class="ms-auto" rechts>
                  <button type="button" class="dropdown-item qa-bewerken" onClick={() => setBewerken(true)}><i class="bi bi-pencil me-2" aria-hidden="true" />Bewerken</button>
                  <Show when={!zelf()}>
                    <Show when={g().archived_at} fallback={<button type="button" class="dropdown-item text-danger qa-archiveren" onClick={() => void archiveren(g())}><i class="bi bi-archive me-2" aria-hidden="true" />Archiveren</button>}>
                      <button type="button" class="dropdown-item qa-dearchiveren" onClick={() => void dearchiveren(g())}><i class="bi bi-arrow-counterclockwise me-2" aria-hidden="true" />Dearchiveren</button>
                    </Show>
                  </Show>
                  <Show when={g().rol === 'klusser' && !g().archived_at}>
                    <button type="button" class="dropdown-item text-warning qa-inloggen-als" onClick={() => void inloggenAls(g())}><i class="bi bi-box-arrow-in-right me-2" aria-hidden="true" />Inloggen als {g().naam}</button>
                  </Show>
                </Dropdown>
              </div>

              <section class="card card-body mb-3 qa-gegevens">
                <h2 class="h5">Gegevens</h2>
                <table class="table table-sm table-borderless w-auto mb-0">
                  <tbody>
                    <tr><th class="pe-4">Naam</th><td>{g().naam}</td></tr>
                    <tr><th class="pe-4">E-mail</th><td class="text-break"><a href={`mailto:${g().email}`}>{g().email}</a></td></tr>
                    <tr><th class="pe-4">Telefoon</th><td>{g().telefoon ? <a href={`tel:${g().telefoon}`}>{g().telefoon}</a> : '--'}</td></tr>
                    <tr><th class="pe-4">Rol</th><td>{g().rol === 'beheerder' ? 'Beheerder' : 'Klusser'}</td></tr>
                    <tr><th class="pe-4">Aangemaakt op</th><td>{datum(g().created_at)}</td></tr>
                    <tr><th class="pe-4">Laatst actief</th><td>{g().last_active_at ? datum(g().last_active_at!) : '--'}</td></tr>
                  </tbody>
                </table>
              </section>

              <section class="card card-body mb-3 qa-gebruiker-dossiers">
                <h2 class="h5">Dossiers</h2>
                <Show when={d().dossiers.length} fallback={<div class="text-muted">Geen dossiers als bezoeker of uitvoerder.</div>}>
                  <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 tabel-kaarten">
                      <thead>
                        <tr>
                          <th>Adres</th>
                          <th>Opdracht</th>
                          <th>Status</th>
                          <th>Laatste activiteit</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={d().dossiers}>
                          {(r) => (
                            <tr class={`row-link qa-dossier qa-dossier-${r.id}`} classList={{ 'text-muted': r.gesloten }} onClick={() => navigate(`/dossiers/${r.id}`)}>
                              <td><A href={`/dossiers/${r.id}`} class="text-reset text-decoration-none fw-semibold">{r.adres}</A></td>
                              <td>
                                <Show when={r.opdracht}>{(o) => <OpdrachtBadge opdracht={o()} />}</Show>
                              </td>
                              <td><StatusLabel label={r.status} ligtBij={r.ligtBij} /></td>
                              <td class="text-nowrap" data-label="Laatste activiteit">{r.laatste_activiteit_at ? kortDatum(r.laatste_activiteit_at) : ''}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </section>

              <A href={`/beheer/activiteit?actor=${g().id}`} class="qa-activiteit-van"><i class="bi bi-clock-history me-1" aria-hidden="true" />Alle activiteit van {g().naam}</A>

              <Show when={bewerken()}>
                <GebruikerForm
                  gebruiker={g()}
                  vasteRol={zelf() ? g().rol : undefined}
                  onSluit={() => setBewerken(false)}
                  onOpgeslagen={(nieuw) => {
                    setBewerken(false);
                    zet(nieuw);
                    melding('success', 'Opgeslagen.');
                  }}
                />
              </Show>
            </>
          );
        }}
      </Match>
    </Switch>
  );
}
