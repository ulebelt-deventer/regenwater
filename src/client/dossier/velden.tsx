// Autosaving inputs, all driven by the field definitions in shared/velden.ts.
import { For, type JSX, Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { euro } from '../../shared/datum.ts';
import { kaartItems } from '../../shared/kaart.ts';
import type { Json } from '../../shared/types.ts';
import { type Veld, lijst, materiaalRijen, materiaalTotaal, nieuwId, veld, veldVoor, waarde } from '../../shared/velden.ts';
import { FotoSlot } from './fotos.tsx';
import { useDossier } from './staat.ts';

// `regenpijp.*.soort` -> `regenpijp-soort`, for qa-* classes.
export const qaNaam = (patroon: string) => patroon.replace(/\.\*\./g, '-').replace(/\.\*$/, '').replace(/\./g, '-');

const tekst = (v: Json) => (typeof v === 'string' ? v : '');

function Hint(props: { veld: Veld }) {
  return (
    <Show when={props.veld.hint}>
      <div class="form-text mt-0 mb-1">{props.veld.hint}</div>
    </Show>
  );
}

export function VeldInvoer(props: { k: string; label?: string; opties?: [string, string][]; kaal?: boolean; class?: string }) {
  const s = useDossier();
  const k = untrack(() => props.k); // a field's key is fixed for its life
  const def = veldVoor(k);
  if (!def || def.anders) throw new Error(`Geen veld voor ${k}`);
  const { veld: v, id } = def;
  const zichtbaar = () => !v.zichtbaar || v.zichtbaar(s.d, id);
  const fotoSlot = v.fotos === undefined ? null : id === null ? v.fotos : v.fotos.replace('*', id);
  const inhoud = (
    <>
      <Show when={!props.kaal}>
        <div class="form-label fw-semibold mb-1">{props.label ?? v.label}</div>
        <Hint veld={v} />
      </Show>
      <Invoer k={props.k} veld={v} opties={props.opties ?? v.opties} uit={!s.mag(v.bewerkers)} />
    </>
  );
  return (
    <Show when={zichtbaar()}>
      <div id={`veld-${props.k}`} class={`qa-veld qa-veld-${qaNaam(v.key)} ${props.class ?? (props.kaal ? '' : 'mb-3')}`}>
        <Show when={fotoSlot} fallback={inhoud}>
          {(slot) => (
            <div class="row g-2">
              <div class="col-12 col-md-8">{inhoud}</div>
              <div class="col-12 col-md-4">
                <FotoSlot k={slot()} />
              </div>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}

function Invoer(props: { k: string; veld: Veld; opties: [string, string][] | undefined; uit: boolean }) {
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
  const anders = (gekozen: () => boolean) => (
    <Show when={props.veld.anders && gekozen()}>
      <input
        ref={(el) => {
          if (andersFocus) queueMicrotask(() => el.focus());
          andersFocus = false;
        }}
        class="form-control mt-1 mt-sm-0 qa-anders"
        placeholder="Namelijk..."
        disabled={props.uit}
        value={tekst(waarde(s.d, andersKey))}
        onInput={(e) => s.zet(andersKey, e.currentTarget.value === '' ? null : e.currentTarget.value)}
      />
    </Show>
  );
  // The Anders option's row also holds its write-in; on phones it drops to its own line.
  const optieRij = (k: string) => (k === 'anders' && props.veld.anders ? 'form-check d-sm-flex align-items-center gap-2' : 'form-check');
  const optieId = (o: string) => `in-${props.k}-${o}`;

  return (
    <Switch fallback={<span class="text-danger">Veldtype {props.veld.type} heeft geen invoer</span>}>
      <Match when={props.veld.type === 'text' || props.veld.type === 'email' || props.veld.type === 'tel'}>
        <input type={props.veld.type} class="form-control qa-invoer" disabled={props.uit} value={tekst(w())} onInput={(e) => zetTekst(e.currentTarget.value)} />
      </Match>
      <Match when={props.veld.type === 'textarea'}>
        <textarea class="form-control qa-invoer" rows="3" disabled={props.uit} value={tekst(w())} onInput={(e) => zetTekst(e.currentTarget.value)} />
      </Match>
      <Match when={props.veld.type === 'number'}>
        <GetalInvoer waarde={w()} min={props.veld.min} max={props.veld.max} uit={props.uit} onZet={zet} />
      </Match>
      <Match when={props.veld.type === 'radio' && props.veld.lijst}>
        {/* Per-option `selected`: a select's `value` is lost when its options re-render. */}
        <div class="d-sm-flex align-items-center gap-2">
          <select class="form-select w-auto mw-100 qa-invoer" disabled={props.uit} onChange={(e) => { kiesAnders(e.currentTarget.value); zet(e.currentTarget.value === '' ? null : e.currentTarget.value); }}>
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
      <Match when={props.veld.type === 'checks'}>
        <div class="big-touch">
          <For each={props.opties}>
            {([k, label]) => {
              const lijstNu = () => (Array.isArray(w()) ? (w() as string[]) : []);
              return (
                <div class={optieRij(k)}>
                  <input
                    class={`form-check-input qa-optie-${k}`}
                    type="checkbox"
                    id={optieId(k)}
                    disabled={props.uit}
                    checked={lijstNu().includes(k)}
                    onChange={(e) => {
                      const rest = lijstNu().filter((x) => x !== k);
                      if (e.currentTarget.checked) kiesAnders(k);
                      const nieuw = e.currentTarget.checked ? [...rest, k] : rest;
                      zet(nieuw.length ? nieuw : null);
                    }}
                  />
                  <label class="form-check-label" classList={{ 'text-nowrap': k === 'anders' }} for={optieId(k)}>{label}</label>
                  {k === 'anders' && anders(() => lijstNu().includes('anders'))}
                </div>
              );
            }}
          </For>
        </div>
      </Match>
      <Match when={props.veld.type === 'select'}>
        <DakKeuze k={props.k} uit={props.uit} />
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

// Saves only once both date and time are filled in; clearing the date clears the afspraak.
function DatumTijd(props: { waarde: string; uit: boolean; onZet: (v: string | null) => void }) {
  const [dag, setDag] = createSignal('');
  const [tijd, setTijd] = createSignal('');
  createEffect(() => {
    if (props.waarde) {
      setDag(props.waarde.slice(0, 10));
      setTijd(props.waarde.slice(11, 16));
    }
  });
  const bewaar = () => {
    if (!dag()) props.onZet(null);
    else if (tijd()) props.onZet(`${dag()}T${tijd()}`);
  };
  return (
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <input type="date" class="form-control w-auto qa-datum" disabled={props.uit} value={dag()} onInput={(e) => { setDag(e.currentTarget.value); bewaar(); }} />
      <input type="time" class="form-control w-auto qa-tijd" disabled={props.uit} value={tijd()} onInput={(e) => { setTijd(e.currentTarget.value); bewaar(); }} />
      <Show when={dag() && !tijd()}>
        <span class="small text-warning qa-tijd-ontbreekt">Vul ook een tijd in</span>
      </Show>
    </div>
  );
}

function DakKeuze(props: { k: string; uit: boolean }) {
  const s = useDossier();
  const pijpId = untrack(() => props.k).split('.')[1];
  const items = () => kaartItems(s.d);
  const pijp = () => {
    const p = items().regenpijpen.find((r) => r.id === pijpId);
    if (!p) throw new Error(`Regenpijp ${pijpId} staat niet op de kaart`);
    return p;
  };
  return (
    <Show when={items().daken.length} fallback={<div class="text-danger small qa-geen-dak">Er is nog geen dak ingetekend op de kaart.</div>}>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <select class="form-select w-auto qa-invoer" disabled={props.uit} value={pijp().dak ?? ''} onChange={(e) => s.zet(props.k, e.currentTarget.value)}>
          <For each={items().daken}>{(d) => <option value={d.id}>{d.label}</option>}</For>
        </select>
        <Show when={pijp().dakAutomatisch}>
          <span class="small text-muted">dichtstbijzijnde dak</span>
        </Show>
      </div>
    </Show>
  );
}

// ---- Lists of items with their own ids: voorstel bullets and materiaal rows ----

export function VoorstelLijst() {
  const s = useDossier();
  const v = veld('voorstel');
  const uit = () => !s.mag(v.bewerkers);
  const ids = () => lijst(s.d, 'voorstel');
  const voegToe = () => {
    const id = nieuwId();
    s.zet('voorstel', [...ids(), id]);
    queueMicrotask(() => document.querySelector<HTMLInputElement>(`#veld-voorstel\\.${id}\\.tekst input`)!.focus());
  };
  const haalWeg = (id: string) => {
    const rest = ids().filter((x) => x !== id);
    s.zet('voorstel', rest.length ? rest : null);
    s.zet(`voorstel.${id}.tekst`, null);
  };
  return (
    <div id="veld-voorstel" class="mb-3 qa-veld qa-veld-voorstel">
      <div class="form-label fw-semibold mb-1">{v.label}</div>
      <p class="small text-muted mb-2">De Ulebelt stelt de volgende werkzaamheden voor:</p>
      <For each={ids()}>
        {(id) => (
          <div class="d-flex gap-2 align-items-center mb-2 qa-voorstel-rij">
            <span aria-hidden="true">•</span>
            <VeldInvoer k={`voorstel.${id}.tekst`} kaal class="flex-grow-1" />
            <Show when={!uit()}>
              <button type="button" class="btn btn-sm btn-outline-danger qa-voorstel-weg" aria-label="Verwijderen" onClick={() => haalWeg(id)}><i class="bi bi-trash3" aria-hidden="true" /></button>
            </Show>
          </div>
        )}
      </For>
      <Show when={!uit()}>
        <button type="button" class="btn btn-sm btn-outline-primary qa-voorstel-toevoegen" onClick={voegToe}><i class="bi bi-plus-lg me-1" aria-hidden="true" />Werkzaamheid toevoegen</button>
      </Show>
    </div>
  );
}

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
  return (
    <div id={`veld-${props.lijst}`} class={`mb-3 qa-veld qa-veld-${props.lijst}`}>
      <div class="form-label fw-semibold mb-1">{v.label}</div>
      <Show when={props.lijst === 'materialen'}>
        <div class="form-text mt-0 mb-1">Vul het aantal in bij wat nodig is; laat de rest leeg.</div>
      </Show>
      <div class="table-responsive">
        <table class={`table table-sm align-middle qa-materialen-${props.lijst}`}>
          <thead>
            <tr>
              <th>Materiaal</th>
              <th style={{ width: '7.5rem' }}>Prijs (€)</th>
              <th style={{ width: '6rem' }}>Aantal</th>
              <th class="d-none d-sm-table-cell text-end">Subtotaal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={ids()}>
              {(id) => {
                const k = (veldNaam: string) => `${item}.${id}.${veldNaam}`;
                return (
                  <tr class="qa-materiaal-rij">
                    <td>
                      <input class="form-control form-control-sm qa-materiaal-naam" disabled={uit()} value={tekst(waarde(s.d, k('naam')))} onInput={(e) => s.zet(k('naam'), e.currentTarget.value === '' ? null : e.currentTarget.value)} />
                    </td>
                    <td>
                      <GetalInvoer waarde={waarde(s.d, k('prijs'))} min={0} schaal={100} uit={uit()} onZet={(n) => s.zet(k('prijs'), n === null ? null : Math.round(n))} class="form-control-sm qa-materiaal-prijs" />
                    </td>
                    <td>
                      <GetalInvoer waarde={waarde(s.d, k('aantal'))} min={0} uit={uit()} onZet={(n) => s.zet(k('aantal'), n)} class="form-control-sm qa-materiaal-aantal" />
                    </td>
                    <td class="d-none d-sm-table-cell text-end text-nowrap qa-subtotaal">{subtotaal(id)}</td>
                    <td class="text-end">
                      <Show when={!uit()}>
                        <button type="button" class="btn btn-sm btn-outline-danger qa-materiaal-weg" aria-label="Verwijderen" onClick={() => haalWeg(id)}><i class="bi bi-trash3" aria-hidden="true" /></button>
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
