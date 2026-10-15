// Bezoek sub-page (bezoeker, on-site): the kaart with daken, tuinen, stenen and regenpijpen, then what was found.
import { A } from '@solidjs/router';
import { For, Show, createSignal } from 'solid-js';
import { NORMAFVOER_MM } from '../../shared/constants.ts';
import { type Aandeel, KOPPEL_M, bronnenTekst, getal, herverdeel, kaartItems, verdelingTekst, verdelingVoor, verdelingWaarde, waterberging } from '../../shared/kaart.ts';
import { ontbrekend, veld } from '../../shared/velden.ts';
import { Dropdown, OnderdeelIcoon, bevestig, gaNaar } from '../ui.tsx';
import { MijlpaalRegel, zetMijlpaal } from './acties.tsx';
import { FotoSlot, KaartVeld } from './fotos.tsx';
import { TerugLink } from './pagina.tsx';
import { type DossierStaat, useDossier } from './staat.ts';
import { VeldInvoer } from './velden.tsx';

const REGENPIJP_VELDEN = ['soort', 'diameter', 'regenton', 'ondergrond', 'afkoppelen', 'waar', 'hoe'];

// Opens a collapsed regenpijp section before scrolling, since gaNaar can't scroll to a hidden field.
function naarVeld(anker: string) {
  const el = document.getElementById(anker);
  if (!el) throw new Error(`Geen element met id ${anker}`);
  const details = el.closest('details');
  if (details) details.open = true;
  gaNaar(anker);
}

// window.scrollTo's smooth behaviour has no fixed duration, so this eases over `ms` itself.
function scrollNaar(y: number, ms: number, klaar: () => void) {
  const van = window.scrollY;
  const start = performance.now();
  const stap = (nu: number) => {
    const t = Math.min(1, (nu - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
    // 'instant' overrides Bootstrap's `scroll-behavior: smooth` on :root, which would fight each frame.
    window.scrollTo({ top: van + (y - van) * e, behavior: 'instant' });
    if (t < 1) requestAnimationFrame(stap);
    else klaar();
  };
  requestAnimationFrame(stap);
}

// One regenpijp as its own accordion. Its header sticks to the top of the screen while you scroll through its fields; tapping it while stuck scrolls back to the start of the section first, then collapses it.
function RegenpijpSectie(props: { id: string }) {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  const pijp = () => {
    const p = items().regenpijpen.find((r) => r.id === props.id);
    if (!p) throw new Error(`Regenpijp ${props.id} staat niet op de kaart`);
    return p;
  };
  const [open, setOpen] = createSignal(true);
  let item!: HTMLDetailsElement;
  const tik = (e: MouseEvent) => {
    const top = item.getBoundingClientRect().top;
    if (top >= 0) return;
    e.preventDefault();
    scrollNaar(window.scrollY + top, 250, () => (item.open = false));
  };
  return (
    <div class="accordion mb-3">
      <details ref={item} open class="accordion-item qa-regenpijp" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary class="accordion-button fw-semibold qa-regenpijp-kop" classList={{ collapsed: !open() }} onClick={tik}>Regenpijp {pijp().label}</summary>
        <div class="accordion-body">
          <div id={`veld-regenpijp.${props.id}.bronnen`} class="mb-3 qa-veld qa-veld-regenpijp-bronnen">
            <div class="form-label fw-semibold mb-1">Voert af van</div>
            <div class="d-flex align-items-center gap-2">
              <Show when={pijp().bronnen.length} fallback={<span class="text-danger qa-geen-bron">Aan geen dak gekoppeld</span>}>
                <span class="qa-bronnen">{bronnenTekst(pijp(), items().labels)}</span>
              </Show>
              <button type="button" class="btn btn-sm btn-outline-secondary qa-bronnen-wijzig" aria-label="Wijzigen bij Dak" onClick={() => gaNaar('veld-daken')}><i class="bi bi-pencil" aria-hidden="true" /></button>
            </div>
          </div>
          <For each={REGENPIJP_VELDEN}>{(v) => <VeldInvoer k={`regenpijp.${props.id}.${v}`} />}</For>
        </div>
      </details>
    </div>
  );
}

// A dakdeel's regenpijpen and each one's share. Ticking a regenpijp re-runs the nearest-pijp split; typing a % scales the others.
function VerdelingKeuze(props: { id: string }) {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  const dak = () => items().daken.find((x) => x.id === props.id)!;
  const uit = () => !s.mag(veld('dak.*.verdeling').bewerkers);
  const k = () => `dak.${props.id}.verdeling`;
  const bewaar = (v: Aandeel[]) => s.zet(k(), verdelingWaarde(dak(), v));
  const aandeel = (pijp: string) => dak().verdeling.find((a) => a.pijp === pijp);
  const afstand = (pijp: string) => dak().afstandM.get(pijp)!;
  const wissel = (pijp: string, aan: boolean) =>
    bewaar(verdelingVoor(s.d, props.id, items().regenpijpen.map((r) => r.id).filter((id) => (id === pijp ? aan : aandeel(id) !== undefined))));
  return (
    <div id={`veld-${k()}`} class="qa-veld qa-veld-dak-verdeling">
      <Dropdown
        sluitBijKlik={false}
        knopClass="btn btn-sm btn-outline-secondary text-start qa-verdeling-knop"
        knop={
          <>
            <span class="qa-verdeling-tekst">{dak().verdeling.length ? verdelingTekst(dak(), items().labels) : 'geen regenpijp'}</span>
            <Show when={dak().automatisch}><span class="text-muted ms-1">(automatisch)</span></Show>
          </>
        }
      >
        <Show when={items().regenpijpen.length} fallback={<span class="dropdown-item-text text-muted">Nog geen regenpijp op de kaart</span>}>
          <For each={items().regenpijpen}>
            {(r) => (
              <div class="dropdown-item-text d-flex align-items-center gap-2 text-nowrap qa-verdeling-pijp">
                <input class="form-check-input mt-0 qa-verdeling-aan" type="checkbox" id={`in-${k()}-${r.id}`} disabled={uit()} checked={aandeel(r.id) !== undefined} onChange={(e) => wissel(r.id, e.currentTarget.checked)} />
                <label class="form-check-label me-auto" for={`in-${k()}-${r.id}`}>Regenpijp {r.label}</label>
                <Show when={aandeel(r.id)}>
                  {(a) => (
                    <div class="input-group input-group-sm w-auto">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        class="form-control qa-verdeling-pct"
                        style={{ width: '4.5rem' }}
                        disabled={uit() || dak().verdeling.length === 1}
                        value={a().pct}
                        onChange={(e) => {
                          const n = e.currentTarget.valueAsNumber;
                          if (Number.isFinite(n)) bewaar(herverdeel(dak().verdeling, r.id, n));
                          else e.currentTarget.value = String(a().pct);
                        }}
                      />
                      <span class="input-group-text">%</span>
                    </div>
                  )}
                </Show>
                <Show when={afstand(r.id) !== null}>
                  <span class="small text-muted qa-verdeling-afstand">{getal(Math.round(afstand(r.id)! * 10) / 10)} m</span>
                  <Show when={afstand(r.id)! > KOPPEL_M}><span class="badge text-bg-danger qa-verdeling-ver">&gt; {KOPPEL_M} m weg</span></Show>
                </Show>
              </div>
            )}
          </For>
        </Show>
        <Show when={!dak().automatisch && !uit()}>
          <div class="dropdown-divider" />
          <button type="button" class="dropdown-item qa-verdeling-automatisch" onClick={() => s.zet(k(), null)}>Terug naar automatisch</button>
        </Show>
      </Dropdown>
      <Show when={dak().verlopen}>
        <div class="small text-warning qa-verdeling-verlopen">Een regenpijp is weg: controleer de verdeling.</div>
      </Show>
    </div>
  );
}

export function Bezoek() {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  const geenDak = () => (
    <div class="text-danger mb-2 qa-geen-dak">
      Er is nog geen dak ingetekend op de kadasterkaart. <button type="button" class="btn btn-link link-danger p-0 align-baseline" onClick={() => gaNaar('veld-kaart')}>Naar de kaart</button>
    </div>
  );
  const m2Cel = (id: string, soort: 'dak' | 'tuin' | 'steen', m2: number | null, berekend: boolean) => (
    <Show when={berekend} fallback={<VeldInvoer k={`${soort}.${id}.m2`} kaal />}>
      {m2 === null ? '--' : `${getal(m2)} m²`}
    </Show>
  );

  return (
    <>
      <TerugLink />
      <section class="card card-body mb-3 qa-bezoek">
        <h2 class="h5">Bezoek</h2>
        <KaartVeld />

        <div id="veld-daken" class="mb-3 qa-daken">
          <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="dak" class="me-1" />Dak</div>
          <Show when={items().daken.length} fallback={geenDak()}>
            <Show when={!items().opSchaal}>
              <div class="form-text mt-0 mb-1">De kaart is niet op schaal. Vul de m² zelf in.</div>
            </Show>
            {/* No table-responsive wrapper: its overflow would clip the Regenpijpen dropdown. Rows go by id so they, and an open dropdown, survive a change to the dak. */}
            <table class="table table-sm align-middle mb-1 tabel-kaarten qa-daken-tabel">
              <thead>
                <tr>
                  <th>Dakdeel</th>
                  <th style={{ width: '9rem' }}>m²*</th>
                  <th>Regenpijpen</th>
                </tr>
              </thead>
              <tbody>
                <For each={items().daken.map((x) => x.id)}>
                  {(id) => {
                    const dak = () => items().daken.find((x) => x.id === id)!;
                    return (
                      <tr class="qa-dak-rij">
                        <td class="fw-semibold">{dak().label}</td>
                        <td class="d-flex d-md-table-cell align-items-center gap-2" data-label="m²*">{m2Cel(id, 'dak', dak().m2, dak().m2Berekend)}</td>
                        <td data-label="Regenpijpen"><VerdelingKeuze id={id} /></td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={items().regenpijpen.length}>
              <table class="table table-sm align-middle mt-3 mb-1 tabel-kaarten qa-regenpijpen-tabel">
                <thead>
                  <tr>
                    <th>Regenpijp</th>
                    <th>Voert af van</th>
                    <th>Waterberging**</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={items().regenpijpen}>
                    {(r) => (
                      <tr class="qa-regenpijp-rij">
                        <td class="fw-semibold">{r.label}</td>
                        <td class="qa-bronnen" data-label="Voert af van">{bronnenTekst(r, items().labels) || <span class="text-danger">geen dak</span>}</td>
                        <td class="qa-waterberging" data-label="Waterberging**">
                          <Show when={waterberging(r, items().daken)} fallback="--">
                            {(w) => (
                              <>
                                {w().liter} liter
                                <div class="small text-muted">{w().uitleg}</div>
                              </>
                            )}
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
            <div class="small text-muted">* bron: kadastrale kaart (PDOK)</div>
            <div class="small text-muted">** per regenpijp gebaseerd op normafvoer {NORMAFVOER_MM} mm regenwater</div>
          </Show>
        </div>

        <div id="veld-tuinen" class="mb-3 qa-tuinen">
          <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="tuin" class="me-1" />Tuin</div>
          <Show
            when={items().tuinen.length}
            fallback={
              <div class="text-danger mb-2 qa-geen-tuin">
                Er is nog geen tuin ingetekend op de kadasterkaart. <button type="button" class="btn btn-link link-danger p-0 align-baseline" onClick={() => gaNaar('veld-kaart')}>Naar de kaart</button>
              </div>
            }
          >
            <For each={items().tuinen}>
              {(tuin) => (
                <div class="row g-2 align-items-start border-bottom py-2 qa-tuin-rij">
                  <div class="col-3 col-md-2 fw-semibold">{tuin.label}</div>
                  <div class="col-9 col-md-3">{m2Cel(tuin.id, 'tuin', tuin.m2, tuin.m2Berekend)}</div>
                  <div class="col-12 col-md-7">
                    <FotoSlot k={`tuin.${tuin.id}`} />
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <Show when={items().stenen.length}>
          <div id="veld-stenen" class="mb-3 qa-stenen">
            <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="steen" class="me-1" />Steen</div>
            <For each={items().stenen}>
              {(steen) => (
                <div class="row g-2 align-items-start border-bottom py-2 qa-steen-rij">
                  <div class="col-3 col-md-2 fw-semibold">{steen.label}</div>
                  <div class="col-9 col-md-3">{m2Cel(steen.id, 'steen', steen.m2, steen.m2Berekend)}</div>
                  <div class="col-12 col-md-7">
                    <FotoSlot k={`steen.${steen.id}`} />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <VeldInvoer k="verhard" />
        <VeldInvoer k="tuinsituatie" />

        <For each={items().regenpijpen.map((r) => r.id)}>{(id) => <RegenpijpSectie id={id} />}</For>

        <VeldInvoer k="hoosbuien" />
        <VeldInvoer k="wensen" />

        <Controle s={s} pagina="bezoek" />
        <MijlpaalRegel mijlpaal="bezoek_afgerond" label="Bezoek afgerond" />
        <Show when={!s.d.bezoek_afgerond_at && s.mag(['bezoeker'])}>
          <button type="button" class="btn btn-success btn-lg qa-bezoek-afronden" onClick={() => void afronden(s, 'bezoek', 'bezoek_afgerond')}>Bezoek afronden</button>
        </Show>
        <div class="mt-3">
          <A href={`/dossiers/${s.id}/plan`} class="qa-naar-plan">Verder met het Plan van Aanpak →</A>
        </div>
      </section>
    </>
  );
}

// Missing fields only warn; the hand-off stays possible, since some answers can't be known on-site.
export async function afronden(s: DossierStaat, pagina: 'bezoek' | 'plan', mijlpaal: 'bezoek_afgerond' | 'klaar_voor_controle', bevestiging?: string) {
  const mist = ontbrekend(s.d, pagina);
  const vraag = [mist.length ? `Er ontbreekt nog: ${mist.map((m) => m.label).join(', ')}.` : '', bevestiging ?? ''].filter(Boolean).join(' ');
  if (vraag && !(await bevestig('Weet je het zeker?', vraag, { ja: 'Ja, afronden' }))) return;
  await zetMijlpaal(s, mijlpaal);
}

export function Controle(props: { s: DossierStaat; pagina: 'bezoek' | 'plan' }) {
  const mist = () => ontbrekend(props.s.d, props.pagina);
  return (
    <div class="border-top pt-3 mb-3 qa-controle">
      <div class="form-label fw-semibold mb-1">Controle</div>
      <Show when={mist().length} fallback={<div class="text-groen qa-compleet">✅ Alles is opgeslagen en lijkt compleet.</div>}>
        <div class="text-warning mb-1">Nog niet ingevuld:</div>
        <ul class="mb-0 qa-ontbrekend">
          <For each={mist()}>
            {(m) => (
              <li>
                <button type="button" class="btn btn-link p-0 text-start align-baseline qa-ontbrekend-link" onClick={() => naarVeld(m.anker)}>{m.label}</button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
