// Bezoek sub-page (bezoeker, on-site): the kaart with daken, tuinen, terrassen and regenpijpen, then what was found.
import { A } from '@solidjs/router';
import { For, Show, createSignal } from 'solid-js';
import { NORMAFVOER_MM } from '../../shared/constants.ts';
import { getal, kaartItems, waterberging } from '../../shared/kaart.ts';
import { ontbrekend } from '../../shared/velden.ts';
import { bevestig, gaNaar } from '../ui.tsx';
import { MijlpaalRegel, zetMijlpaal } from './acties.tsx';
import { FotoSlot, KaartVeld } from './fotos.tsx';
import { TerugLink } from './pagina.tsx';
import { type DossierStaat, useDossier } from './staat.ts';
import { VeldInvoer } from './velden.tsx';

const REGENPIJP_VELDEN = ['dak', 'soort', 'diameter', 'regenton', 'ondergrond', 'afkoppelen', 'waar', 'hoe'];

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
function RegenpijpSectie(props: { id: string; label: string }) {
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
        <summary class="accordion-button fw-semibold qa-regenpijp-kop" classList={{ collapsed: !open() }} onClick={tik}>Regenpijp {props.label}</summary>
        <div class="accordion-body">
          <For each={REGENPIJP_VELDEN}>{(v) => <VeldInvoer k={`regenpijp.${props.id}.${v}`} />}</For>
        </div>
      </details>
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
  const m2Cel = (id: string, soort: 'dak' | 'tuin' | 'terras', m2: number | null, berekend: boolean) => (
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
          <div class="form-label fw-semibold mb-1">Dak</div>
          <Show when={items().daken.length} fallback={geenDak()}>
            <Show when={!items().opSchaal}>
              <div class="form-text mt-0 mb-1">De kaart is niet op schaal. Vul de m² zelf in.</div>
            </Show>
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-1 tabel-kaarten qa-daken-tabel">
                <thead>
                  <tr>
                    <th>Dakdeel</th>
                    <th style={{ width: '9rem' }}>m²*</th>
                    <th>Regenpijpen</th>
                    <th>Waterberging per regenpijp**</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={items().daken}>
                    {(dak) => (
                      <tr class="qa-dak-rij">
                        <td class="fw-semibold">{dak.label}</td>
                        <td class="d-flex d-md-table-cell align-items-center gap-2" data-label="m²*">{m2Cel(dak.id, 'dak', dak.m2, dak.m2Berekend)}</td>
                        <td data-label="Regenpijpen">{dak.regenpijpen.map((id) => items().labels.get(id)).join(', ') || '--'}</td>
                        <td class="qa-waterberging" data-label="Waterberging per regenpijp**">
                          <Show when={dak.regenpijpen.length} fallback={<span class="text-muted">-- (geen regenpijp)</span>}>
                            <Show when={waterberging(dak)} fallback="--">
                              {(w) => (
                                <>
                                  {w().liter} liter
                                  <div class="small text-muted">{w().uitleg}</div>
                                </>
                              )}
                            </Show>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <div class="small text-muted">* bron: kadastrale kaart (PDOK)</div>
            <div class="small text-muted">** per regenpijp gebaseerd op normafvoer {NORMAFVOER_MM} mm regenwater</div>
          </Show>
        </div>

        <div id="veld-tuinen" class="mb-3 qa-tuinen">
          <div class="form-label fw-semibold mb-1">Tuin</div>
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

        <Show when={items().terrassen.length}>
          <div id="veld-terrassen" class="mb-3 qa-terrassen">
            <div class="form-label fw-semibold mb-1">Terras</div>
            <For each={items().terrassen}>
              {(terras) => (
                <div class="row g-2 align-items-start border-bottom py-2 qa-terras-rij">
                  <div class="col-3 col-md-2 fw-semibold">{terras.label}</div>
                  <div class="col-9 col-md-3">{m2Cel(terras.id, 'terras', terras.m2, terras.m2Berekend)}</div>
                  <div class="col-12 col-md-7">
                    <FotoSlot k={`terras.${terras.id}`} />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <VeldInvoer k="verhard" />
        <VeldInvoer k="tuinsituatie" />

        <For each={items().regenpijpen}>{(r) => <RegenpijpSectie id={r.id} label={r.label} />}</For>

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
