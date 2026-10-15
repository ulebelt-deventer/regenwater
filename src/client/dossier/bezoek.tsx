// Bezoek sub-page (bezoeker, on-site): the kaart with daken, tuinen, stenen and regenpijpen, then what was found.
import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { NORMAFVOER_MM } from '../../shared/constants.ts';
import { type Aandeel, KOPPEL_M, annotatiesSvg, bronnenTekst, getal, herverdeel, kaartAnnotaties, kaartFoto, kaartItems, verdelingVoor, verdelingWaarde, vierkanteUitsnede, waterberging } from '../../shared/kaart.ts';
import { ontbrekend, veld } from '../../shared/velden.ts';
import { Dropdown, OnderdeelIcoon, bevestig, gaNaar } from '../ui.tsx';
import { MijlpaalRegel, zetMijlpaal } from './acties.tsx';
import { FotoSlot, KaartVeld } from './fotos.tsx';
import { TerugLink } from './pagina.tsx';
import { type DossierStaat, useDossier } from './staat.ts';
import { VeldInvoer } from './velden.tsx';

// The kaart cropped to a regenpijp and the dakdelen it drains, so you can see at a glance which part of the roof that is.
function BronnenUitsnede(props: { id: string }) {
  const s = useDossier();
  const annots = () => kaartAnnotaties(s.d);
  const pijp = () => kaartItems(s.d).regenpijpen.find((r) => r.id === props.id)!;
  const punten = () => {
    const daken = new Set(pijp().bronnen.map((b) => b.dak));
    return annots().filter((a) => a.id === props.id || daken.has(a.id)).flatMap((a) => a.p);
  };
  return (
    <Show when={pijp().bronnen.length ? kaartFoto(s.d) : null}>
      {(foto) => {
        const u = () => vierkanteUitsnede(punten(), foto().breedte, foto().hoogte);
        return (
          <svg class="border rounded flex-shrink-0 qa-bronnen-uitsnede" style={{ width: '3.6rem', height: '3.6rem' }} viewBox={`${u().x} ${u().y} ${u().zijde} ${u().zijde}`}>
            <image href={`/api/fotos/${foto().id}`} width={foto().breedte} height={foto().hoogte} />
            {/* eslint-disable-next-line solid/no-innerhtml -- annotatiesSvg escapes all text */}
            <g innerHTML={annotatiesSvg(annots(), { schaal: u().zijde / 150, mPerPx: null, geselecteerd: props.id })} />
          </svg>
        );
      }}
    </Show>
  );
}

// One regenpijp as a bordered block of cells that wrap: the short answers side by side, the long ones in wider columns.
function RegenpijpBlok(props: { id: string }) {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  const pijp = () => {
    const p = items().regenpijpen.find((r) => r.id === props.id);
    if (!p) throw new Error(`Regenpijp ${props.id} staat niet op de kaart`);
    return p;
  };
  const k = (v: string) => `regenpijp.${props.id}.${v}`;
  return (
    <div class="border rounded p-2 mb-2 qa-regenpijp qa-regenpijp-rij">
      <div class="row g-3">
        <div class="col-auto">
          <div class="form-label fw-semibold mb-1">Pijp</div>
          <div class="fs-5 fw-bold qa-regenpijp-kop">{pijp().label}</div>
        </div>
        <div id={`veld-${k('bronnen')}`} class="col-auto d-flex align-items-start gap-2 qa-veld qa-veld-regenpijp-bronnen">
          <div>
            <div class="form-label fw-semibold mb-1">Voert af van</div>
            <Show when={pijp().bronnen.length} fallback={<span class="text-danger qa-geen-bron">Aan geen dak gekoppeld</span>}>
              <span class="qa-bronnen">{bronnenTekst(pijp(), items().labels)}</span>
            </Show>
          </div>
          <BronnenUitsnede id={props.id} />
        </div>
        <div class="col-auto">
          <div class="form-label fw-semibold mb-1">Waterberging**</div>
          <div class="qa-waterberging">
            <Show when={waterberging(pijp(), items().daken)} fallback="--">
              {(w) => (
                <>
                  {w().liter} liter
                  <div class="small text-muted">{w().uitleg}</div>
                </>
              )}
            </Show>
          </div>
        </div>
        <For each={['soort', 'diameter', 'regenton', 'afkoppelen']}>{(v) => <VeldInvoer k={k(v)} class="col-auto" />}</For>
        <For each={['waar', 'hoe', 'ondergrond']}>{(v) => <VeldInvoer k={k(v)} class="col-12 col-md-6 col-xl-4" fotoOnder />}</For>
      </div>
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
  const ver = (pijp: string) => aandeel(pijp) !== undefined && afstand(pijp)! > KOPPEL_M;
  const wissel = (pijp: string, aan: boolean) =>
    bewaar(verdelingVoor(s.d, props.id, items().regenpijpen.map((r) => r.id).filter((id) => (id === pijp ? aan : aandeel(id) !== undefined))));
  return (
    <div id={`veld-${k()}`} class="qa-veld qa-veld-dak-verdeling">
      <Dropdown
        sluitBijKlik={false}
        knopClass="btn btn-sm btn-light border text-start qa-verdeling-knop"
        knop={
          <span class="qa-verdeling-tekst">
            <Show when={dak().verdeling.length} fallback="geen regenpijp">
              <For each={dak().verdeling}>
                {(a, i) => (
                  <>
                    {i() > 0 && ' · '}
                    <strong>{items().labels.get(a.pijp)}</strong>
                    {dak().verdeling.length > 1 && ` ${a.pct}%`}
                  </>
                )}
              </For>
            </Show>
          </span>
        }
      >
        <Show when={items().regenpijpen.length} fallback={<span class="dropdown-item-text text-muted">Nog geen regenpijp op de kaart</span>}>
          {/* A table so the % inputs line up whatever the label widths. */}
          <table class="table table-sm table-borderless align-middle text-nowrap mx-2 mb-0 w-auto">
            <tbody>
              <For each={items().regenpijpen}>
                {(r) => (
                  <tr class="qa-verdeling-pijp">
                    <td>
                      <div class="form-check mb-0">
                        <input class="form-check-input qa-verdeling-aan" type="checkbox" id={`in-${k()}-${r.id}`} disabled={uit()} checked={aandeel(r.id) !== undefined} onChange={(e) => wissel(r.id, e.currentTarget.checked)} />
                        <label class="form-check-label qa-verdeling-label" for={`in-${k()}-${r.id}`}>Regenpijp {r.label}</label>
                        <Show when={!r.bronnen.length}><div class="small text-danger qa-verdeling-geen-dak">Heeft geen dakdeel</div></Show>
                      </div>
                    </td>
                    <td>
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
                    </td>
                    <td class="text-end">
                      <Show when={afstand(r.id) !== null}>
                        {/* Only a far pijp that still gets water from this dak is suspicious. */}
                        <span class="small qa-verdeling-afstand" classList={{ 'text-muted': !ver(r.id), 'fw-bold text-danger qa-verdeling-ver': ver(r.id) }}>
                          {getal(Math.round(afstand(r.id)! * 10) / 10)} m
                        </span>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <Show when={dak().automatisch}>
          <div class="dropdown-item-text small text-muted fst-italic qa-verdeling-auto">Automatisch verdeeld: elk stuk dak gaat naar de dichtstbijzijnde regenpijp.</div>
        </Show>
        <Show when={!dak().automatisch && !uit()}>
          <div class="dropdown-divider" />
          <button type="button" class="dropdown-item qa-verdeling-automatisch" onClick={() => s.zet(k(), null)}><i class="bi bi-arrow-repeat me-1" aria-hidden="true" />Terug naar automatisch</button>
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
            <table class="table table-sm align-middle w-auto mb-1 tabel-kaarten qa-daken-tabel">
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
            <div class="small text-muted">* bron: kadastrale kaart (PDOK)</div>
          </Show>
        </div>

        <Show when={items().regenpijpen.length}>
          {/* By id, so typing in a field doesn't recreate the block and lose focus. */}
          <div id="veld-regenpijpen" class="mb-3 qa-regenpijpen">
            <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="regenpijp" class="me-1" />Regenpijpen</div>
            <For each={items().regenpijpen.map((r) => r.id)}>{(id) => <RegenpijpBlok id={id} />}</For>
            <div class="small text-muted">** per regenpijp gebaseerd op normafvoer {NORMAFVOER_MM} mm regenwater</div>
          </div>
        </Show>

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

        <VeldInvoer k="tuinsituatie" />
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
                <button type="button" class="btn btn-link p-0 text-start align-baseline qa-ontbrekend-link" onClick={() => gaNaar(m.anker)}>{m.label}</button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
