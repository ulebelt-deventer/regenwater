// Autosaving inputs, all driven by the field definitions in shared/velden.ts.
import { For, type JSX, Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { euro } from '../../shared/datum.ts';
import type { Json } from '../../shared/types.ts';
import { type Veld, lijst, materiaalRijen, materiaalTotaal, nieuwId, opsommingRegels, veld, veldVoor, waarde } from '../../shared/velden.ts';
import { Dropdown } from '../ui.tsx';
import { FotoSlot } from './fotos.tsx';
import { useDossier } from './staat.ts';

// `regenpijp.*.soort` -> `regenpijp-soort`, for qa-* classes.
export const qaNaam = (patroon: string) => patroon.replace(/\.\*\./g, '-').replace(/\.\*$/, '').replace(/\./g, '-');

const tekst = (v: Json) => (typeof v === 'string' ? v : '');

function Hint(props: { tekst: string | undefined }) {
  return (
    <Show when={props.tekst}>
      <div class="form-text mt-0 mb-1 qa-hint">{props.tekst}</div>
    </Show>
  );
}

// The label and hint span the field; under them the photo slot sits beside the input, or under it with `fotoOnder` or 2+ photos, so those lie side by side. `breed` stretches a dropdown or number input to its column.
export function VeldInvoer(props: { k: string; label?: string; hint?: string; opties?: [string, string][]; suggesties?: [string, string][]; kaal?: boolean; class?: string; fotoOnder?: boolean; breed?: boolean; labelClass?: string }) {
  const s = useDossier();
  const k = untrack(() => props.k); // a field's key is fixed for its life
  const def = veldVoor(k);
  if (!def || def.anders) throw new Error(`Geen veld voor ${k}`);
  const { veld: v, id } = def;
  const zichtbaar = () => !v.zichtbaar || v.zichtbaar(s.d, id);
  const fotoSlot = v.fotos === undefined ? null : id === null ? v.fotos : v.fotos.replace('*', id);
  const invoer = <Invoer k={props.k} veld={v} opties={props.opties ?? v.opties} suggesties={props.suggesties ?? v.suggesties} uit={!s.mag(v.bewerkers)} breed={props.breed} />;
  return (
    <Show when={zichtbaar()}>
      <div id={`veld-${props.k}`} class={`qa-veld qa-veld-${qaNaam(v.key)} ${props.class ?? (props.kaal ? '' : 'mb-3')}`}>
        <Show when={!props.kaal}>
          <div class={`form-label fw-semibold mb-1 ${props.labelClass ?? ''}`}>{props.label ?? v.label}</div>
          <Hint tekst={props.hint ?? v.hint} />
        </Show>
        <Show when={fotoSlot} fallback={invoer}>
          {(slot) => {
            const onder = () => props.fotoOnder || s.d.fotos.filter((f) => f.slot === slot()).length > 1;
            return (
              <div class="row g-2">
                <div class={onder() ? 'col-12' : 'col-12 col-md-8'}>{invoer}</div>
                <div class={onder() ? 'col-12' : 'col-12 col-md-4'}>
                  <FotoSlot k={slot()} />
                </div>
              </div>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}

function Invoer(props: { k: string; veld: Veld; opties: [string, string][] | undefined; suggesties: [string, string][] | undefined; uit: boolean; breed?: boolean }) {
  const s = useDossier();
  const w = () => waarde(s.d, props.k);
  const zet = (v: Json) => s.zet(props.k, v);
  const zetTekst = (t: string) => zet(t === '' ? null : t);
  const andersKey = `${untrack(() => props.k)}_anders`;
  // Set when the user picks Anders, so the write-in grabs focus as it appears but not when the page loads with Anders already chosen.
  let andersFocus = false;
  const kiesAnders = (k: string) => {
    if (k === 'anders') andersFocus = true;
  };
  // `inMenu`: the write-in takes the Anders checkbox's place, so leaving it empty unticks Anders to bring the checkbox back.
  const anders = (gekozen: () => boolean, inMenu = false) => (
    <Show when={props.veld.anders && gekozen()}>
      <input
        ref={(el) => {
          if (andersFocus) queueMicrotask(() => el.focus());
          andersFocus = false;
        }}
        class={`form-control qa-anders ${inMenu ? 'form-control-sm' : 'mt-1 mt-sm-0'}`}
        placeholder="Namelijk..."
        disabled={props.uit}
        value={tekst(waarde(s.d, andersKey))}
        onInput={(e) => s.zet(andersKey, e.currentTarget.value === '' ? null : e.currentTarget.value)}
        onBlur={(e) => inMenu && e.currentTarget.value === '' && wissel('anders', false)}
      />
    </Show>
  );
  const gekozen = () => (Array.isArray(w()) ? (w() as string[]) : []);
  const wissel = (k: string, aan: boolean) => {
    const rest = gekozen().filter((x) => x !== k);
    if (aan) kiesAnders(k);
    const nieuw = aan ? [...rest, k] : rest;
    zet(nieuw.length ? nieuw : null);
  };
  const gekozenTekst = () =>
    props.opties!.filter(([k]) => gekozen().includes(k)).map(([k, label]) => (k === 'anders' ? tekst(waarde(s.d, andersKey)) || 'Anders' : label)).join(', ');
  const gekozenLabel = () => {
    if (w() === null) return null;
    const o = [...props.opties!, ...(props.veld.vervallen ?? [])].find(([k]) => k === w());
    if (!o) throw new Error(`Onbekende optie ${String(w())} voor ${props.k}`);
    return o[1].replace(/, namelijk:$/, '');
  };
  // The Anders option's row also holds its write-in; on phones it drops to its own line.
  const optieRij = (k: string) => (k === 'anders' && props.veld.anders ? 'form-check d-sm-flex align-items-center gap-2' : 'form-check');
  const optieId = (o: string) => `in-${props.k}-${o}`;

  return (
    <Switch fallback={<span class="text-danger">Veldtype {props.veld.type} heeft geen invoer</span>}>
      <Match when={props.veld.type === 'text' || props.veld.type === 'email' || props.veld.type === 'tel'}>
        <input type={props.veld.type} class="form-control qa-invoer" disabled={props.uit} value={tekst(w())} onInput={(e) => zetTekst(e.currentTarget.value)} />
      </Match>
      <Match when={props.veld.type === 'textarea' && props.veld.opsomming}>
        <Opsomming waarde={tekst(w())} suggesties={props.suggesties ?? []} rijen={props.veld.rijen ?? 3} uit={props.uit} onZet={zet} />
      </Match>
      <Match when={props.veld.type === 'textarea'}>
        <textarea class="form-control qa-invoer" rows={props.veld.rijen ?? 3} disabled={props.uit} value={tekst(w())} onInput={(e) => zetTekst(e.currentTarget.value)} />
      </Match>
      <Match when={props.veld.type === 'number'}>
        <GetalInvoer waarde={w()} min={props.veld.min} max={props.veld.max} uit={props.uit} onZet={zet} class={props.breed ? '' : undefined} />
      </Match>
      <Match when={props.veld.type === 'radio' && props.veld.menu}>
        <div class="d-sm-flex align-items-center gap-2">
          <Dropdown class={`dropdown-lang ${props.breed ? 'flex-grow-1' : ''}`} knopClass={`btn btn-light border text-start mw-100 text-wrap qa-invoer ${props.breed ? 'w-100 d-flex justify-content-between align-items-center gap-2' : ''}`} knop={<span class="qa-keuze-tekst">{gekozenLabel() || '- kies -'}</span>}>
            <button type="button" class="dropdown-item text-muted qa-optie-leeg" disabled={props.uit} onClick={() => zet(null)}>- kies -</button>
            <For each={props.opties}>
              {([k, label]) => (
                <button type="button" class={`dropdown-item qa-optie-${k}`} classList={{ active: w() === k }} disabled={props.uit} onClick={() => { kiesAnders(k); zet(k); }}>{label.replace(/, namelijk:$/, '...')}</button>
              )}
            </For>
          </Dropdown>
          {anders(() => w() === 'anders')}
        </div>
      </Match>
      <Match when={props.veld.type === 'radio' && props.veld.lijst}>
        {/* Per-option `selected`: a select's `value` is lost when its options re-render. */}
        <div class="d-sm-flex align-items-center gap-2">
          <select class={`form-select mw-100 qa-invoer ${props.breed ? 'w-100' : 'w-auto'}`} disabled={props.uit} onChange={(e) => { kiesAnders(e.currentTarget.value); zet(e.currentTarget.value === '' ? null : e.currentTarget.value); }}>
            <option value="" selected={!w()}>- kies -</option>
            <For each={props.opties}>{([k, label]) => <option value={k} selected={w() === k}>{label.replace(/, namelijk:$/, '...')}</option>}</For>
          </select>
          {anders(() => w() === 'anders')}
        </div>
      </Match>
      <Match when={props.veld.type === 'radio'}>
        <div class="big-touch">
          <For each={props.opties}>
            {([k, label]) => (
              <div class={optieRij(k)}>
                <input class={`form-check-input qa-optie-${k}`} type="radio" name={`in-${props.k}`} id={optieId(k)} disabled={props.uit} checked={w() === k} onChange={() => { kiesAnders(k); zet(k); }} />
                <label class="form-check-label" classList={{ 'text-nowrap': k === 'anders' }} for={optieId(k)}>{label}</label>
                {k === 'anders' && anders(() => w() === 'anders')}
              </div>
            )}
          </For>
        </div>
      </Match>
      <Match when={props.veld.type === 'checks' && props.veld.lijst}>
        <Dropdown sluitBijKlik={false} knopClass={`btn btn-light border text-start mw-100 text-wrap qa-invoer ${props.breed ? 'w-100 d-flex justify-content-between align-items-center gap-2' : ''}`} knop={<span class="qa-keuzes-tekst">{gekozenTekst() || '- kies -'}</span>}>
          <For each={props.opties}>
            {([k, label]) => (
              <div class="px-3 py-1 text-nowrap qa-keuze">
                <Show
                  when={k === 'anders' && props.veld.anders && gekozen().includes('anders')}
                  fallback={
                    <div class="form-check mb-0">
                      <input class={`form-check-input qa-optie-${k}`} type="checkbox" id={optieId(k)} disabled={props.uit} checked={gekozen().includes(k)} onChange={(e) => wissel(k, e.currentTarget.checked)} />
                      <label class="form-check-label" for={optieId(k)}>{label.replace(/, namelijk:$/, '...')}</label>
                    </div>
                  }
                >
                  {anders(() => true, true)}
                </Show>
              </div>
            )}
          </For>
        </Dropdown>
      </Match>
      <Match when={props.veld.type === 'checks'}>
        <div class="big-touch">
          <For each={props.opties}>
            {([k, label]) => (
              <div class={optieRij(k)}>
                <input class={`form-check-input qa-optie-${k}`} type="checkbox" id={optieId(k)} disabled={props.uit} checked={gekozen().includes(k)} onChange={(e) => wissel(k, e.currentTarget.checked)} />
                <label class="form-check-label" classList={{ 'text-nowrap': k === 'anders' }} for={optieId(k)}>{label}</label>
                {k === 'anders' && anders(() => gekozen().includes('anders'))}
              </div>
            )}
          </For>
        </div>
      </Match>
      <Match when={props.veld.type === 'date'}>
        <input type="date" class="form-control w-auto qa-invoer" disabled={props.uit} value={tekst(w())} onInput={(e) => zetTekst(e.currentTarget.value)} />
      </Match>
      <Match when={props.veld.type === 'datetime'}>
        <DatumTijd waarde={tekst(w())} uit={props.uit} onZet={zet} />
      </Match>
    </Switch>
  );
}

// A textarea whose every line starts with "• "; Enter starts a new bullet, and empty lines go once it loses focus. The links above it add a common line, which can then be edited like any other.
function Opsomming(props: { waarde: string; suggesties: [string, string][]; rijen: number; uit: boolean; onZet: (t: string | null) => void }) {
  let el!: HTMLTextAreaElement;
  const opgeslagen = (t: string) => opsommingRegels(t).join('\n') || null;
  const metBullets = (t: string) => opsommingRegels(t).map((r) => `• ${r}`).join('\n');
  // Rewrites the text only when the stored value changed elsewhere, so a fresh empty bullet survives while typing.
  // Fits the height to the text: `rows` is the minimum, .tekstvak-groei's max-height the maximum.
  const groei = () => {
    if (el.offsetParent === null) return; // hidden: nothing to measure, keeps its `rows` height
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  createEffect(() => {
    const w = props.waarde;
    if (opgeslagen(el.value) !== (w || null)) el.value = metBullets(w);
    groei();
  });
  const bewerk = () => {
    let pos = el.selectionStart;
    let begin = 0;
    const regels = el.value.split('\n').map((r) => {
      const nieuw = r.trim() !== '' && !r.startsWith('•') ? `• ${r}` : r;
      if (nieuw !== r && pos > begin) pos += 2;
      begin += r.length + 1;
      return nieuw;
    });
    el.value = regels.join('\n');
    el.setSelectionRange(pos, pos);
    groei();
    props.onZet(opgeslagen(el.value));
  };
  const enter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const regel = el.value.slice(0, el.selectionStart).split('\n').pop()!;
    if (regel.replace('•', '').trim() === '') return;
    el.setRangeText('\n• ', el.selectionStart, el.selectionEnd, 'end');
    groei();
  };
  const voegToe = (t: string) => {
    el.value = metBullets(`${props.waarde}\n${t}`);
    props.onZet(opgeslagen(el.value));
    groei();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollTop = el.scrollHeight;
  };
  return (
    <>
      <Show when={!props.uit && props.suggesties.some(([, t]) => !opsommingRegels(props.waarde).includes(t))}>
        <div class="d-flex flex-wrap column-gap-3 row-gap-1 mb-1 small qa-suggesties">
          <For each={props.suggesties}>
            {([k, t]) => (
              <Show when={!opsommingRegels(props.waarde).includes(t)}>
                <button type="button" class={`btn btn-link btn-sm p-0 text-start text-nowrap overflow-hidden mw-100 qa-suggestie qa-suggestie-${k}`} onClick={() => voegToe(t)}><i class="bi bi-plus-lg me-1" aria-hidden="true" />{t}</button>
              </Show>
            )}
          </For>
        </div>
      </Show>
      <textarea ref={el} class="form-control tekstvak-groei qa-invoer" rows={props.rijen} disabled={props.uit} onInput={bewerk} onKeyDown={enter} onBlur={() => { el.value = metBullets(el.value); groei(); }} />
    </>
  );
}

// Blank saves null; a half-typed number (eg "-") is not sent.
export function GetalInvoer(props: { waarde: Json; min?: number; max?: number; uit: boolean; onZet: (v: number | null) => void; class?: string; schaal?: number }) {
  const schaal = () => props.schaal ?? 1;
  return (
    <input
      type="number"
      inputmode="decimal"
      step="any"
      min={props.min}
      max={props.max}
      class={`form-control qa-invoer ${props.class ?? 'w-auto'}`}
      disabled={props.uit}
      value={typeof props.waarde === 'number' ? props.waarde / schaal() : ''}
      onInput={(e) => {
        if (e.currentTarget.value === '') return props.onZet(null);
        const n = e.currentTarget.valueAsNumber;
        if (Number.isFinite(n)) props.onZet(Math.round(n * schaal() * 100) / 100);
      }}
    />
  );
}

const UREN = Array.from({ length: 15 }, (_, i) => String(i + 6).padStart(2, '0'));
const MINUTEN = ['00', '15', '30', '45'];

// Hour and quarter-hour selects rather than <input type="time">, whose 12h/24h display follows the device's language, not the page's.
// A saved time off that grid (from before the selects) is kept as an extra option so it still shows.
// Saves only once date and hour are filled in (the minutes default to :00); clearing the date clears the afspraak.
function DatumTijd(props: { waarde: string; uit: boolean; onZet: (v: string | null) => void }) {
  const [dag, setDag] = createSignal('');
  const [uur, setUur] = createSignal('');
  const [minuut, setMinuut] = createSignal('');
  createEffect(() => {
    if (props.waarde) {
      setDag(props.waarde.slice(0, 10));
      setUur(props.waarde.slice(11, 13));
      setMinuut(props.waarde.slice(14, 16));
    }
  });
  const bewaar = () => {
    if (!dag()) props.onZet(null);
    else if (uur()) props.onZet(`${dag()}T${uur()}:${minuut()}`);
  };
  const opties = (lijst: string[], huidig: string) => (huidig && !lijst.includes(huidig) ? [...lijst, huidig].sort() : lijst);
  return (
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <input type="date" class="form-control w-auto qa-datum" disabled={props.uit} value={dag()} onInput={(e) => { setDag(e.currentTarget.value); bewaar(); }} />
      {/* Per-option `selected`: a select's `value` is lost when its options re-render. */}
      <div class="d-flex align-items-center gap-1">
        <select class="form-select w-auto qa-uur" aria-label="Uur" disabled={props.uit} onChange={(e) => { setUur(e.currentTarget.value); if (!minuut()) setMinuut('00'); bewaar(); }}>
          <option value="" selected={!uur()} disabled>uur</option>
          <For each={opties(UREN, uur())}>{(u) => <option value={u} selected={uur() === u}>{u}</option>}</For>
        </select>
        <span>:</span>
        <select class="form-select w-auto qa-minuut" aria-label="Minuten" disabled={props.uit} onChange={(e) => { setMinuut(e.currentTarget.value); bewaar(); }}>
          <option value="" selected={!minuut()} disabled>min</option>
          <For each={opties(MINUTEN, minuut())}>{(m) => <option value={m} selected={minuut() === m}>{m}</option>}</For>
        </select>
      </div>
      <Show when={dag() && !uur()}>
        <span class="small text-warning qa-tijd-ontbreekt">Vul ook een tijd in</span>
      </Show>
    </div>
  );
}

// ---- Lists of items with their own ids: materiaal rows ----

export function MateriaalTabel(props: { lijst: 'materialen' | 'gebruikt' }) {
  const s = useDossier();
  const lijstKey = untrack(() => props.lijst);
  const item = lijstKey === 'materialen' ? 'materiaal' : 'gebruikt';
  const v = veld(lijstKey);
  const uit = () => !s.mag(v.bewerkers);
  const ids = () => lijst(s.d, props.lijst);
  const totaal = createMemo(() => materiaalTotaal(materiaalRijen(s.d, props.lijst)));
  const subtotaal = (id: string) => {
    const r = materiaalRijen(s.d, props.lijst).find((x) => x.id === id)!;
    return r.prijs !== null && r.aantal !== null ? euro(Math.round(r.prijs * r.aantal)) : '';
  };
  const haalWeg = (id: string) => {
    const rest = ids().filter((x) => x !== id);
    s.zet(props.lijst, rest.length ? rest : null);
  };
  // From sm as wide as the table (d-sm-inline-block), so the totaal ends at its right edge; on a phone the table fills the width.
  return (
    <div id={`veld-${props.lijst}`} class={`d-sm-inline-block mw-100 mb-3 qa-veld qa-veld-${props.lijst}`}>
      <div class="form-label fw-semibold mb-1">{v.label}</div>
      <Show when={props.lijst === 'materialen'}>
        <div class="form-text mt-0 mb-1">Vul het aantal in bij wat nodig is; laat de rest leeg.</div>
      </Show>
      <div class="table-responsive">
        <table class={`table table-sm align-middle w-100 w-sm-auto qa-materialen-${props.lijst}`}>
          <thead>
            <tr>
              <th>Materiaal</th>
              <th class="w-4-5rem w-sm-7-5rem">Prijs (€)</th>
              <th class="w-3-6rem w-sm-6rem">Aantal</th>
              <th class="d-none d-sm-table-cell text-end">Subtotaal</th>
              <th class="d-none d-sm-table-cell w-1px" />
            </tr>
          </thead>
          <tbody>
            <For each={ids()}>
              {(id) => {
                const k = (veldNaam: string) => `${item}.${id}.${veldNaam}`;
                return (
                  <tr class="qa-materiaal-rij">
                    <td>
                      <input class="form-control form-control-sm px-1 px-sm-2 qa-materiaal-naam" disabled={uit()} value={tekst(waarde(s.d, k('naam')))} onInput={(e) => s.zet(k('naam'), e.currentTarget.value === '' ? null : e.currentTarget.value)} />
                    </td>
                    <td>
                      <GetalInvoer waarde={waarde(s.d, k('prijs'))} min={0} schaal={100} uit={uit()} onZet={(n) => s.zet(k('prijs'), n === null ? null : Math.round(n))} class="form-control-sm px-1 px-sm-2 qa-materiaal-prijs" />
                    </td>
                    <td>
                      <GetalInvoer waarde={waarde(s.d, k('aantal'))} min={0} uit={uit()} onZet={(n) => s.zet(k('aantal'), n)} class="form-control-sm px-1 px-sm-2 qa-materiaal-aantal" />
                    </td>
                    <td class="d-none d-sm-table-cell text-end text-nowrap qa-subtotaal">{subtotaal(id)}</td>
                    {/* Hidden on a phone to give Materiaal room; there an empty Aantal keeps a row out of the plan. */}
                    <td class="d-none d-sm-table-cell text-end">
                      <Show when={!uit()}>
                        <Dropdown knop="" label="Meer" knopClass="btn btn-sm btn-link text-secondary qa-materiaal-menu" vast>
                          <button type="button" class="dropdown-item text-danger qa-materiaal-weg" onClick={() => haalWeg(id)}><i class="bi bi-trash3 me-2" aria-hidden="true" />Verwijderen</button>
                        </Dropdown>
                      </Show>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <Show when={!uit()} fallback={<span />}>
          <button type="button" class="btn btn-sm btn-outline-primary qa-materiaal-toevoegen" onClick={() => s.zet(props.lijst, [...ids(), nieuwId()])}><i class="bi bi-plus-lg me-1" aria-hidden="true" />Ander materiaal</button>
        </Show>
        <div class="fw-semibold qa-materiaal-totaal">
          {props.lijst === 'materialen' ? 'Geschatte materiaalkosten' : 'Gebruikte materiaalkosten'}: {euro(totaal())}
        </div>
      </div>
    </div>
  );
}

// A labelled read-only line in a compact summary, inside a `dl.feiten`; `leeg` shows a dash instead of the value.
export function Regel(props: { label: string; children: JSX.Element; leeg?: boolean; class?: string }) {
  return (
    <div class={`feit ${props.class ?? ''}`} classList={{ 'feit-leeg': props.leeg }}>
      <dt class="text-muted fw-normal">{props.label}</dt>
      <dd class="mb-0 min-w-0">{props.leeg ? <span class="text-muted">--</span> : props.children}</dd>
    </div>
  );
}
