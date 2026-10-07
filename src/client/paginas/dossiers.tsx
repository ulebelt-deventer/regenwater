import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { For, Show, createResource, createSignal } from 'solid-js';
import { datum, kortDatum, lokaal } from '../../shared/datum.ts';
import { LIGT_BIJ_LABEL, type LigtBij } from '../../shared/status.ts';
import { get, post, query } from '../api.ts';
import { nu, sessie } from '../sessie.ts';
import { AandachtBadge, Dropdown, Laden, StatusLabel, probeer, titel } from '../ui.tsx';

export interface LijstRij {
  id: number;
  adres: string;
  plaats: string | null;
  huur_koop: string | null;
  bezoeker: string | null;
  uitvoerder: string | null;
  klusser: string | null;
  stapNr: number;
  status: string;
  ligtBij: LigtBij | null;
  gesloten: boolean;
  uitgevoerd: boolean;
  aandacht: boolean;
  laatste_activiteit_at: string | null;
  created_at: string;
  notities: string | null;
  afspraak: string | null;
  opdracht?: { rol: 'Bezoek' | 'Uitvoering'; aanZet: boolean; klaar: boolean } | null;
  volgende?: string;
  herinnering?: string | null;
}

interface Lijst {
  rijen: LijstRij[];
  totaal: number;
  pagina: number;
  paginas: number;
  stats: { open: number; aandacht: number; uitgevoerd: number } | null;
  opties: {
    plaatsen: string[];
    klussers: { id: number; naam: string }[];
    statusFilters: { key: string; label: string; standaard: 'ja' | 'nee' | null }[];
    sorteringen: [string, string][];
  };
}

export function OpdrachtBadge(props: { opdracht: NonNullable<LijstRij['opdracht']> }) {
  return (
    <span class={`badge ${props.opdracht.aanZet ? 'text-bg-primary' : 'border border-secondary text-secondary'} qa-opdracht`} classList={{ 'qa-opdracht-aan-zet': props.opdracht.aanZet }}>
      {!props.opdracht.aanZet && props.opdracht.klaar ? '✓ ' : ''}
      {props.opdracht.rol}
    </span>
  );
}

const komendeAfspraak = (r: LijstRij) => (r.afspraak && lokaal(r.afspraak) >= nu() ? r.afspraak : null);

const FILTER_KEYS = ['adres', 'plaats', 'bezoeker', 'uitvoerder', 'ligt_bij', 'aandacht', 'stap', 'sorteer', 'pagina'];

export function Dossiers() {
  const beheerder = () => sessie()!.ik.rol === 'beheerder';
  titel(beheerder() ? 'Alle dossiers' : 'Mijn dossiers');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams<Record<string, string>>();
  const zoek = () => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && (FILTER_KEYS.includes(k) || k.startsWith('s_'))) q[k] = v;
    return q;
  };
  const [lijst] = createResource(zoek, (q) => get<Lijst>(`/api/dossiers${query(q)}`));
  const zet = (k: string, v: string | null) => setParams({ [k]: v || undefined, pagina: undefined });
  const [adres, setAdres] = createSignal(params.adres ?? '');
  let adresTimer: ReturnType<typeof setTimeout> | undefined;

  const statusWaarde = (key: string, standaard: 'ja' | 'nee' | null): 'ja' | 'nee' | null => {
    const v = params[`s_${key}`];
    return v === 'ja' || v === 'nee' ? v : v === 'alle' ? null : standaard;
  };
  const volgende = (v: 'ja' | 'nee' | null) => (v === null ? 'ja' : v === 'ja' ? 'nee' : 'alle');
  const tekst = (v: 'ja' | 'nee' | null) => (v === null ? '- alle -' : v === 'ja' ? 'Ja' : 'Nee');

  const nieuw = async () => {
    await probeer(async () => {
      const { id } = await post<{ id: number }>('/api/dossiers');
      navigate(`/dossiers/${id}/intake`);
    });
  };

  return (
    <>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 class="h3 mb-0 me-auto qa-titel">{beheerder() ? 'Alle dossiers' : 'Mijn dossiers'}</h1>
        <Show when={beheerder()}>
          <a class="btn btn-outline-secondary qa-csv" href={`/api/dossiers.csv${query(zoek())}`}>CSV downloaden</a>
          <button type="button" class="btn btn-primary qa-nieuw-dossier" onClick={() => void nieuw()}><i class="bi bi-plus-lg me-1" aria-hidden="true" />Nieuw dossier</button>
        </Show>
      </div>

      <Show when={lijst.latest?.stats}>
        {(s) => (
          <div class="d-flex flex-wrap gap-4 mb-3 qa-stats">
            <span>Open: <strong class="qa-stat-open">{s().open}</strong></span>
            <span class="text-danger">Aandacht nodig: <strong class="qa-stat-aandacht">{s().aandacht}</strong></span>
            <span class="text-success">Uitgevoerd: <strong class="qa-stat-uitgevoerd">{s().uitgevoerd}</strong></span>
          </div>
        )}
      </Show>

      <Show when={lijst.latest}>
        {(l) => (
          <div class="row g-2 align-items-end mb-3 qa-filters">
            <div class="col-12 col-md-3">
              <input
                class="form-control form-control-sm qa-filter-adres"
                placeholder="Adres"
                value={adres()}
                onInput={(e) => {
                  setAdres(e.currentTarget.value);
                  clearTimeout(adresTimer);
                  adresTimer = setTimeout(() => zet('adres', adres()), 300);
                }}
              />
            </div>
            <div class="col-6 col-md-2">
              <select class="form-select form-select-sm qa-filter-plaats" value={params.plaats ?? ''} onChange={(e) => zet('plaats', e.currentTarget.value)}>
                <option value="">Plaats: alle</option>
                <For each={l().opties.plaatsen}>{(p) => <option value={p}>{p}</option>}</For>
              </select>
            </div>
            <Show when={beheerder()}>
              <div class="col-6 col-md-2">
                <select class="form-select form-select-sm qa-filter-bezoeker" value={params.bezoeker ?? ''} onChange={(e) => zet('bezoeker', e.currentTarget.value)}>
                  <option value="">Bezoeker: alle</option>
                  <For each={l().opties.klussers}>{(k) => <option value={k.id}>{k.naam}</option>}</For>
                </select>
              </div>
              <div class="col-6 col-md-2">
                <select class="form-select form-select-sm qa-filter-uitvoerder" value={params.uitvoerder ?? ''} onChange={(e) => zet('uitvoerder', e.currentTarget.value)}>
                  <option value="">Uitvoerder: alle</option>
                  <For each={l().opties.klussers}>{(k) => <option value={k.id}>{k.naam}</option>}</For>
                </select>
              </div>
              <div class="col-6 col-md-2">
                <select class="form-select form-select-sm qa-filter-ligt-bij" value={params.ligt_bij ?? ''} onChange={(e) => zet('ligt_bij', e.currentTarget.value)}>
                  <option value="">Ligt bij: iedereen</option>
                  <For each={Object.entries(LIGT_BIJ_LABEL)}>{([k, v]) => <option value={k}>{v}</option>}</For>
                </select>
              </div>
            </Show>
            <div class="col-auto">
              <div class="form-check mb-1">
                <input id="f-aandacht" type="checkbox" class="form-check-input qa-filter-aandacht" checked={params.aandacht === '1'} onChange={(e) => zet('aandacht', e.currentTarget.checked ? '1' : null)} />
                <label class="form-check-label small" for="f-aandacht">Aandacht nodig</label>
              </div>
            </div>
            <div class="col-auto">
              <Dropdown knop="Status" knopClass="btn btn-sm btn-outline-secondary qa-filter-status" sluitBijKlik={false}>
                <For each={l().opties.statusFilters}>
                  {(f) => (
                    <button
                      type="button"
                      class={`dropdown-item d-flex justify-content-between gap-3 qa-status-filter-${f.key}`}
                      onClick={() => zet(`s_${f.key}`, volgende(statusWaarde(f.key, f.standaard)))}
                    >
                      <span>{f.label}</span>
                      <span class="text-muted qa-waarde">{tekst(statusWaarde(f.key, f.standaard))}</span>
                    </button>
                  )}
                </For>
              </Dropdown>
            </div>
            <div class="col-auto">
              <select class="form-select form-select-sm qa-sorteer" value={params.sorteer ?? 'nieuw'} onChange={(e) => zet('sorteer', e.currentTarget.value)}>
                <For each={l().opties.sorteringen}>{([k, v]) => <option value={k}>{v}</option>}</For>
              </select>
            </div>
            <Show when={params.stap}>
              <div class="col-auto small">
                Stap {params.stap} <button type="button" class="btn btn-link btn-sm p-0" onClick={() => zet('stap', null)}>wissen</button>
              </div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={lijst.latest} fallback={<Laden />}>
        {(l) => (
          <>
            <Show when={l().rijen.length === 0}>
              <p class="text-muted qa-leeg">Geen dossiers gevonden.</p>
            </Show>
            <Show when={l().rijen.length > 0}>
              <Show when={beheerder()} fallback={<KlusserTabel rijen={l().rijen} />}>
                <BeheerderTabel rijen={l().rijen} />
              </Show>
            </Show>
            <Show when={l().paginas > 1}>
              <nav class="mt-3">
                <ul class="pagination pagination-sm flex-wrap qa-paginas">
                  <For each={Array.from({ length: l().paginas }, (_, i) => i + 1)}>
                    {(p) => (
                      <li class="page-item" classList={{ active: p === l().pagina }}>
                        <button type="button" class="page-link" onClick={() => setParams({ pagina: p === 1 ? undefined : String(p) })}>{p}</button>
                      </li>
                    )}
                  </For>
                </ul>
              </nav>
            </Show>
          </>
        )}
      </Show>
    </>
  );
}

function BeheerderTabel(props: { rijen: LijstRij[] }) {
  const navigate = useNavigate();
  return (
    <>
      <div class="table-responsive d-none d-md-block">
        <table class="table table-hover align-middle qa-dossiers">
          <thead>
            <tr>
              <th>Adres</th>
              <th>Huur/koop</th>
              <th>Klusser</th>
              <th>Status</th>
              <th>Laatste activiteit</th>
              <th>Notities</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rijen}>
              {(r) => (
                <tr class={`row-link qa-dossier qa-dossier-${r.id}`} onClick={() => navigate(`/dossiers/${r.id}`)}>
                  <td>
                    <A href={`/dossiers/${r.id}`} class="text-reset text-decoration-none qa-adres">{r.adres}</A>
                    <Show when={r.aandacht}> <AandachtBadge /></Show>
                  </td>
                  <td>{r.huur_koop ?? ''}</td>
                  <td>{r.klusser ?? ''}</td>
                  <td><StatusLabel label={r.status} ligtBij={r.ligtBij} /></td>
                  <td class="text-nowrap">{r.laatste_activiteit_at ? kortDatum(r.laatste_activiteit_at) : ''}</td>
                  <td class="small text-muted text-truncate" style={{ 'max-width': '16rem' }}>{r.notities ?? ''}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="d-md-none qa-kaarten">
        <For each={props.rijen}>{(r) => <DossierKaart rij={r} />}</For>
      </div>
    </>
  );
}

function DossierKaart(props: { rij: LijstRij; klusser?: boolean }) {
  const r = () => props.rij;
  const gedempt = () => props.klusser && !r().opdracht!.aanZet;
  return (
    <A href={`/dossiers/${r().id}`} class={`card mb-2 text-reset text-decoration-none qa-dossier qa-dossier-${r().id}`} classList={{ 'text-muted': gedempt() }}>
      <div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between gap-2">
          <div class="fw-semibold text-truncate min-w-0">
            <Show when={props.klusser && r().opdracht}>{(o) => <><OpdrachtBadge opdracht={o()} />{' '}</>}</Show>
            <span class="qa-adres">{r().adres}</span>
          </div>
          <Show when={!props.klusser || r().opdracht!.aanZet} fallback={<span class="small">{r().volgende}</span>}>
            <StatusLabel label={r().status} ligtBij={r().ligtBij} />
          </Show>
        </div>
        <div class="small text-muted">
          {[r().klusser, komendeAfspraak(r()) ? `afspraak ${datum(komendeAfspraak(r())!)}` : null].filter(Boolean).join(' · ')}
          <Show when={r().aandacht}> <AandachtBadge /></Show>
        </div>
        <Show when={r().herinnering}>
          <div class="small text-warning qa-herinnering">{r().herinnering}</div>
        </Show>
      </div>
    </A>
  );
}

function KlusserTabel(props: { rijen: LijstRij[] }) {
  const navigate = useNavigate();
  return (
    <>
      <div class="table-responsive d-none d-md-block">
        <table class="table table-hover align-middle qa-dossiers">
          <thead>
            <tr>
              <th>Adres</th>
              <th>Opdracht</th>
              <th>Volgende stap</th>
              <th>Afspraak</th>
              <th>Laatste activiteit</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rijen}>
              {(r) => (
                <tr class={`row-link qa-dossier qa-dossier-${r.id}`} classList={{ 'text-muted': !r.opdracht!.aanZet }} onClick={() => navigate(`/dossiers/${r.id}`)}>
                  <td>
                    <A href={`/dossiers/${r.id}`} class="text-reset text-decoration-none qa-adres">{r.adres}</A>
                    <Show when={r.herinnering}>
                      <div class="small text-warning qa-herinnering">{r.herinnering}</div>
                    </Show>
                  </td>
                  <td><OpdrachtBadge opdracht={r.opdracht!} /></td>
                  <td class="qa-volgende">
                    <Show when={r.opdracht!.aanZet} fallback={<span class="small">{r.volgende}</span>}>
                      <StatusLabel label={r.status} ligtBij={r.ligtBij} />
                    </Show>
                  </td>
                  <td class="text-nowrap">{komendeAfspraak(r) ? datum(komendeAfspraak(r)!) : ''}</td>
                  <td class="text-nowrap">{r.laatste_activiteit_at ? kortDatum(r.laatste_activiteit_at) : ''}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="d-md-none qa-kaarten">
        <For each={props.rijen}>{(r) => <DossierKaart rij={r} klusser />}</For>
      </div>
    </>
  );
}
