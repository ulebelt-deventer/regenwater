// Bezoek sub-page (bezoeker, on-site): the kaart with daken, tuinen, stenen and regenpijpen, then what was found.
import { For, Show, createSignal, onMount } from 'solid-js';
import { AUTO_VERDELING_UITLEG, type Aandeel, KOPPEL_M, annotatiesSvg, autoGesplitst, bronLabel, getal, herverdeel, kaartAnnotaties, kaartFoto, kaartItems, normafvoerTekst, regenpijpUitsnede, verdelingVoor, verdelingWaarde, waterberging } from '../../shared/kaart.ts';
import { KAART_MELDINGEN } from '../../shared/aandacht.ts';
import type { Dossier } from '../../shared/types.ts';
import { nietOpRiool, ontbrekend, veld } from '../../shared/velden.ts';
import { isNetwerkFout, post } from '../api.ts';
import { Dropdown, Modal, OnderdeelIcoon, bevestig, gaNaar, melding, scrollNaar, tip } from '../ui.tsx';
import { MijlpaalRegel, VerbergKnop, actie, zetMijlpaal } from './acties.tsx';
import { FotoSlot, KaartVeld } from './fotos.tsx';
import { TerugLink, useNaarSectie } from './pagina.tsx';
import { type DossierStaat, useDossier } from './staat.ts';
import { VeldInvoer } from './velden.tsx';

// The kaart cropped to a regenpijp, so you can see at a glance where it is; .regenpijp-uitsnede places it over the block's corner. Tapping it scrolls up to the kaart without toggling the block's summary it sits in.
function BronnenUitsnede(props: { id: string }) {
  const s = useDossier();
  const annots = () => kaartAnnotaties(s.d);
  const pijp = () => kaartItems(s.d).regenpijpen.find((r) => r.id === props.id)!;
  const punten = () => {
    const daken = new Set(pijp().bronnen.map((b) => b.dak));
    return annots().filter((a) => a.id === props.id || daken.has(a.id)).flatMap((a) => a.p);
  };
  return (
    <Show when={kaartFoto(s.d)}>
      {(foto) => {
        const u = () => regenpijpUitsnede(annots().find((a) => a.id === props.id)!.p[0], punten(), foto());
        return (
          <button type="button" class="p-0 border rounded overflow-hidden bg-body regenpijp-uitsnede qa-bronnen-uitsnede" aria-label="Naar de kaart" onClick={(e) => { e.preventDefault(); scrollNaar('veld-kaart', 250); }}>
            <svg class="d-block w-100 h-100" viewBox={`${u().x} ${u().y} ${u().zijde} ${u().zijde}`}>
              <image href={`/api/fotos/${foto().id}`} width={foto().breedte} height={foto().hoogte} />
              {/* eslint-disable-next-line solid/no-innerhtml -- annotatiesSvg escapes all text */}
              <g innerHTML={annotatiesSvg(annots(), { schaal: u().zijde / 150, mPerPx: null, geselecteerd: props.id })} />
            </svg>
          </button>
        );
      }}
    </Show>
  );
}

// Six short cells fill one lg row; below them Waar and Hoe take half a row each (photos beside them from md), then Ondergrond.
const KORT = 'col-6 col-md-4 col-lg-2';
// Labels too long for their cell are cut off on one line, so the inputs below stay level with their neighbours'.
const LABEL_CLASS: Record<string, string> = { regenton: 'label-klein label-afgekapt', hoe: 'label-afgekapt' };

// A beheerder's override of the dossier's norm, with a reason for the activity log.
function NormModal(props: { onSluit: () => void }) {
  const s = useDossier();
  const [mm, setMm] = createSignal(String(s.d.normafvoer.mm));
  const [reden, setReden] = createSignal('');
  const opslaan = async (e: Event) => {
    e.preventDefault();
    if (await actie(s, 'normafvoer', { mm: Number(mm()), reden: reden() })) props.onSluit();
  };
  return (
    <Modal
      titel="Normafvoer van dit dossier"
      onSluit={props.onSluit}
      voet={
        <>
          <button type="button" class="btn btn-outline-secondary" onClick={props.onSluit}>Annuleren</button>
          <button type="submit" form="norm-form" class="btn btn-primary qa-norm-opslaan">Opslaan</button>
        </>
      }
    >
      <form id="norm-form" onSubmit={opslaan}>
        <label class="form-label fw-semibold" for="norm-mm">Normafvoer (mm)</label>
        <input id="norm-mm" class="form-control mb-3 qa-norm-mm" style={{ 'max-width': '7rem' }} type="number" min="1" max="100" step="1" required value={mm()} onInput={(e) => setMm(e.currentTarget.value)} />
        <label class="form-label fw-semibold" for="norm-reden">Reden</label>
        <input id="norm-reden" class="form-control qa-norm-reden" required value={reden()} onInput={(e) => setReden(e.currentTarget.value)} />
      </form>
    </Modal>
  );
}

// One regenpijp as a bordered, collapsible block (open by default): the kaart thumbnail on its corner, a heading that toggles it, then a grid whose columns line up from block to block.
function RegenpijpBlok(props: { id: string }) {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  const pijp = () => {
    const p = items().regenpijpen.find((r) => r.id === props.id);
    if (!p) throw new Error(`Regenpijp ${props.id} staat niet op de kaart`);
    return p;
  };
  const k = (v: string) => `regenpijp.${props.id}.${v}`;
  // The state the block is in or sliding towards. A closed details hides its content at once, so closing keeps it open until the slide ends.
  const [open, setOpen] = createSignal(true);
  let blok!: HTMLDetailsElement;
  let inhoud!: HTMLDivElement;
  let schuif: Animation | null = null;
  // A click the thumbnail already handled (defaultPrevented) leaves the block as it is.
  const wissel = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    // A closed details keeps its content's last size.
    const van = blok.open ? inhoud.offsetHeight : 0;
    schuif?.cancel();
    setOpen(!open());
    blok.open = true;
    const naar = open() ? inhoud.scrollHeight : 0;
    inhoud.style.overflow = 'hidden';
    schuif = inhoud.animate([{ height: `${van}px` }, { height: `${naar}px` }], { duration: 200, easing: 'linear' });
    schuif.onfinish = () => {
      schuif = null;
      inhoud.style.overflow = '';
      blok.open = open();
    };
  };
  // onToggle catches an outside open (gaNaar); during a slide the toggle is the slide's own.
  return (
    <details ref={blok} open class="border rounded shadow-sm mb-2 regenpijp-blok qa-regenpijp qa-regenpijp-rij" onToggle={(e) => schuif === null && setOpen(e.currentTarget.open)}>
      {/* The thumbnail sits in the summary because a closed details shows nothing else. */}
      <summary class="d-flex align-items-center fs-5 py-2 pe-2 regenpijp-kop qa-regenpijp-kop" classList={{ 'border-bottom regenpijp-kop-open': open() }} onClick={wissel}>
        <BronnenUitsnede id={props.id} />
        <span class="flex-grow-1 qa-regenpijp-titel">Regenpijp {pijp().label}</span>
        <i class="bi fs-6 text-muted me-1 qa-regenpijp-caret" classList={{ 'bi-caret-up': open(), 'bi-caret-down': !open() }} aria-hidden="true" />
      </summary>
      <div ref={inhoud} class="qa-regenpijp-inhoud">
        <div class="p-2">
          <div class="row gx-3 gy-2">
            <VeldInvoer k={k('afkoppelen')} class={KORT} breed />
            <Show when={nietOpRiool(s.d, props.id)}>
              <div id={`veld-${k('bronnen')}`} class={`${KORT} qa-veld qa-veld-regenpijp-bronnen`}>
                <div class="form-label fw-semibold mb-1">Voert af van</div>
                <Show when={pijp().bronnen.length} fallback={<span class="text-danger qa-geen-bron">Aan geen dak gekoppeld</span>}>
                  <span class="qa-bronnen">
                    <For each={pijp().bronnen}>
                      {(b, i) => (
                        <>
                          {i() > 0 && ', '}
                          <span class="text-nowrap qa-bron">{bronLabel(b, items().labels)}</span>
                        </>
                      )}
                    </For>
                  </span>
                </Show>
              </div>
              <div class={KORT}>
                <div class="form-label fw-semibold mb-1">
                  Waterberging<span class="cursor-help qa-waterberging-uitleg" ref={tip(() => normafvoerTekst(s.d.normafvoer))}>**</span>
                </div>
                <div class="qa-waterberging">
                  <Show when={waterberging(pijp(), items().daken, s.d.normafvoer.mm)} fallback="--">
                    {(w) => (
                      <>
                        {w().liter} liter
                        <div class="text-muted" style={{ 'font-size': '.8em' }}>{w().uitleg}</div>
                      </>
                    )}
                  </Show>
                </div>
              </div>
              <For each={['soort', 'diameter', 'regenton']}>{(v) => <VeldInvoer k={k(v)} class={KORT} breed labelClass={LABEL_CLASS[v]} />}</For>
              <For each={['waar', 'hoe']}>{(v) => <VeldInvoer k={k(v)} class="col-12 col-md-6" breed labelClass={LABEL_CLASS[v]} />}</For>
              <VeldInvoer k={k('ondergrond')} class="col-12 col-md-4" fotoOnder breed />
            </Show>
          </div>
        </div>
      </div>
    </details>
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
    <div id={`veld-${k()}`} class="d-flex flex-wrap align-items-center justify-content-end column-gap-1 ms-auto qa-veld qa-veld-dak-verdeling">
      <Dropdown
        rechts
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
                          <div class="input-group input-group-sm flex-nowrap w-auto">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              class="form-control px-1 qa-verdeling-pct"
                              style={{ width: '2.7rem' }}
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
          <div class="dropdown-item-text small text-muted fst-italic qa-verdeling-auto">Automatisch verdeeld: {AUTO_VERDELING_UITLEG}.</div>
        </Show>
        <Show when={!dak().automatisch && !uit()}>
          <div class="dropdown-divider" />
          <button type="button" class="dropdown-item qa-verdeling-automatisch" onClick={() => s.zet(k(), null)}><i class="bi bi-arrow-repeat me-1" aria-hidden="true" />Terug naar automatisch</button>
        </Show>
      </Dropdown>
      <Show when={autoGesplitst(dak())}>
        <span class="cursor-help qa-verdeling-voetnoot-teken" ref={tip(`Automatisch verdeeld: ${AUTO_VERDELING_UITLEG}`)}>†</span>
      </Show>
      <Show when={dak().verlopen}>
        <div class="w-100 small text-warning qa-verdeling-verlopen">Een regenpijp is weg: controleer de verdeling.</div>
      </Show>
    </div>
  );
}

export function Bezoek() {
  const s = useDossier();
  const naarSectie = useNaarSectie();
  const items = () => kaartItems(s.d);
  const [normOpen, setNormOpen] = createSignal(false);
  // A lost request isn't reported: Bezoek afgerond fixes the norm as well, and the bezoeker can't act on it on site.
  onMount(() => {
    if (s.d.normafvoer.vast_at || s.d.gesloten_at) return;
    post<{ dossier: Dossier }>(`/api/dossiers/${s.id}/bezoek-geopend`).then(
      (r) => s.vervang(r.dossier),
      (e: Error) => {
        if (!isNetwerkFout(e)) melding('danger', e.message);
      },
    );
  });
  const ulebeltSuggesties =() => veld('ulebelt_doet').suggesties!.filter(([k]) => k !== 'toestemming' || s.d.huur_koop === 'huur');
  const kaartMelding = (sleutel: keyof typeof KAART_MELDINGEN) => (
    <Show when={!s.d.verborgen.includes(sleutel)}>
      <div class={`text-danger mb-2 qa-${sleutel.replace('_', '-')}`}>
        {KAART_MELDINGEN[sleutel]} <button type="button" class="btn btn-link link-danger p-0 align-baseline" onClick={() => gaNaar('veld-kaart')}>Naar de kaart</button>
        <VerbergKnop sleutel={sleutel} />
      </div>
    </Show>
  );
  const m2Cel = (id: string, soort: 'dak' | 'tuin' | 'steen', m2: number | null, berekend: boolean, breed = false) => (
    <Show when={berekend} fallback={<VeldInvoer k={`${soort}.${id}.m2`} kaal breed={breed} />}>
      {m2 === null ? '--' : `${getal(m2)} m²`}
    </Show>
  );
  // A tuin or steen row in fixed-width columns (widths include the 1rem gutter), so the rows line up. The photos fill the rest of the row; on phones two or more get a line of their own.
  const deelRij = (soort: 'tuin' | 'steen', deel: { id: string; label: string; m2: number | null; m2Berekend: boolean }) => {
    const veelFotos = () => s.d.fotos.filter((f) => f.slot === `${soort}.${deel.id}`).length > 1;
    return (
      <div class={`border-bottom py-2 qa-${soort}-rij`}>
        <div class="row gx-3 gy-2 align-items-start">
          <div class="col-auto fw-semibold" style={{ width: '3rem' }}>{deel.label}</div>
          <div class="col-auto" style={{ width: '8rem' }}>{m2Cel(deel.id, soort, deel.m2, deel.m2Berekend, true)}</div>
          <div class={veelFotos() ? 'col-12 col-sm' : 'col'}>
            <FotoSlot k={`${soort}.${deel.id}`} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <TerugLink sectie="sectie-bezoek" />
      <section class="mb-3 qa-bezoek">
        <h2>Bezoek</h2>
        <KaartVeld />

        <div id="veld-daken" class="mb-3 pt-3 qa-daken">
          <h3 class="mb-3"><OnderdeelIcoon soort="dak" class="me-1" />Dak</h3>
          <Show when={items().daken.length} fallback={kaartMelding('geen_dak')}>
            <Show when={!items().opSchaal}>
              <div class="form-text mt-0 mb-1">De kaart is niet op schaal. Vul de m² zelf in.</div>
            </Show>
            {/* No table-responsive wrapper: its overflow would clip the Regenpijpen dropdown. Rows go by id so they, and an open dropdown, survive a change to the dak. */}
            <table class="table table-sm align-middle w-auto mb-1 tabel-kaarten qa-daken-tabel">
              <thead>
                <tr>
                  <th>Dakdeel</th>
                  <th style={{ width: '9rem' }}>m²*</th>
                  <th class="text-end">Regenpijpen</th>
                </tr>
              </thead>
              <tbody>
                <For each={items().daken.map((x) => x.id)}>
                  {(id) => {
                    const dak = () => items().daken.find((x) => x.id === id)!;
                    return (
                      <tr class="qa-dak-rij">
                        <td class="fw-semibold kaart-titel">{dak().label}</td>
                        <td class="d-flex d-md-table-cell align-items-center gap-2 kaart-hoek">{m2Cel(id, 'dak', dak().m2, dak().m2Berekend)}</td>
                        <td class="d-flex d-md-table-cell flex-wrap align-items-center gap-1 text-md-end" data-label="Regenpijpen"><VerdelingKeuze id={id} /></td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <div class="small text-muted">* bron: kadastrale kaart (PDOK)</div>
            <Show when={items().daken.some(autoGesplitst)}>
              <div class="small text-muted qa-verdeling-voetnoot">† automatisch verdeeld: {AUTO_VERDELING_UITLEG}</div>
            </Show>
          </Show>
        </div>

        <Show when={items().regenpijpen.length}>
          {/* By id, so typing in a field doesn't recreate the block and lose focus. */}
          <div id="veld-regenpijpen" class="mb-3 pt-3 qa-regenpijpen">
            <h3 class="mb-3"><OnderdeelIcoon soort="regenpijp" class="me-1" />Regenpijpen</h3>
            <For each={items().regenpijpen.map((r) => r.id)}>{(id) => <RegenpijpBlok id={id} />}</For>
            <div class="small text-muted">
              ** <span class="qa-normafvoer">{normafvoerTekst(s.d.normafvoer)}</span>
              <Show when={s.beheerder() && !s.d.gesloten_at}>
                {' '}<button type="button" class="btn btn-link btn-sm p-0 align-baseline qa-norm-wijzigen" onClick={() => setNormOpen(true)}>Wijzigen</button>
              </Show>
            </div>
            <Show when={normOpen()}><NormModal onSluit={() => setNormOpen(false)} /></Show>
          </div>
        </Show>

        <div id="veld-tuinen" class="mb-3 qa-tuinen">
          <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="tuin" class="me-1" />Tuin</div>
          <Show
            when={items().tuinen.length}
            fallback={kaartMelding('geen_tuin')}
          >
            <div class="border-top">
              <For each={items().tuinen}>{(tuin) => deelRij('tuin', tuin)}</For>
            </div>
          </Show>
        </div>

        <Show when={items().stenen.length}>
          <div id="veld-stenen" class="mb-3 qa-stenen">
            <div class="form-label fw-semibold mb-1"><OnderdeelIcoon soort="steen" class="me-1" />Steen</div>
            <div class="border-top">
              <For each={items().stenen}>{(steen) => deelRij('steen', steen)}</For>
            </div>
          </div>
        </Show>

        <VeldInvoer k="tuinsituatie" />
        <VeldInvoer k="hoosbuien" />
        <VeldInvoer k="wensen" />
        <div id="veld-andere_fotos" class="mb-3">
          <div class="form-label fw-semibold mb-1">Andere foto’s</div>
          <FotoSlot k="andere_fotos" />
        </div>

        <div id="veld-afspraken" class="pt-3 qa-afspraken">
          <h3 class="mb-3">Afspraken</h3>
          <VeldInvoer k="bewoner_doet" />
          <VeldInvoer k="ulebelt_doet" suggesties={ulebeltSuggesties()} />
        </div>

        <Controle s={s} pagina="bezoek" />
        <MijlpaalRegel mijlpaal="bezoek_afgerond" label="Bezoek afgerond" />
        <Show when={!s.d.bezoek_afgerond_at && s.mag(['bezoeker'])}>
          <button type="button" class="btn btn-success btn-lg qa-bezoek-afronden" onClick={async () => (await afronden(s, 'bezoek', 'bezoek_afgerond')) && naarSectie('sectie-bezoek')}>Bezoek afronden</button>
        </Show>
        <div class="mt-3 text-center">
          <TerugLink sectie="sectie-bezoek" class="" />
        </div>
      </section>
    </>
  );
}

// Missing fields only warn; the hand-off stays possible, since some answers can't be known on-site.
export async function afronden(s: DossierStaat, pagina: 'bezoek' | 'plan', mijlpaal: 'bezoek_afgerond' | 'klaar_voor_controle', bevestiging?: string): Promise<boolean> {
  const mist = ontbrekend(s.d, pagina);
  const vraag = [mist.length ? `Er ontbreekt nog: ${mist.map((m) => m.label).join(', ')}.` : '', bevestiging ?? ''].filter(Boolean).join(' ');
  if (vraag && !(await bevestig('Weet je het zeker?', vraag, { ja: 'Ja, afronden' }))) return false;
  return zetMijlpaal(s, mijlpaal);
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
