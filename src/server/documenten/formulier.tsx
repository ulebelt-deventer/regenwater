import { For, type JSX, Show } from 'solid-js';
import { datumTijd } from '../../shared/datum.ts';
import { bronnenTekst, kaartAnnotaties, kaartFoto, kaartItems } from '../../shared/kaart.ts';
import { adresRegel, str } from '../../shared/status.ts';
import type { Dossier } from '../../shared/types.ts';
import { VELDEN, type Veld, materiaalRijen } from '../../shared/velden.ts';
import { type Doc, Fotos, FotoMetTekening, Kop } from './onderdelen.tsx';

// Item fields get their own blocks below; `kaart_annotaties` is the kaart itself.
const losseVelden = (pagina: 'bezoek' | 'plan') =>
  VELDEN.filter((v) => v.pagina === pagina && !v.key.includes('*') && v.type !== 'annotaties' && v.key !== 'materialen');
const REGENPIJP_VELDEN = VELDEN.filter((v) => v.pagina === 'bezoek' && v.key.startsWith('regenpijp.*.'));
const LEGE_PIJPEN = ['A', 'B', 'C', 'D'];
const LEGE_DELEN = 3;

function Lijnen(props: { n: number }): JSX.Element {
  return <For each={Array.from({ length: props.n })}>{() => <div class="lijnen" />}</For>;
}

function Antwoord(props: { veld: Veld }): JSX.Element {
  const v = () => props.veld;
  return (
    <Show when={v().opties} fallback={<>
      <Show when={v().suggesties}>
        <div>
          <For each={v().suggesties!}>{([, t]) => <span class="optie">{t}</span>}</For>
        </div>
      </Show>
      <Lijnen n={v().type === 'textarea' || v().type === 'ids' ? 3 : 1} />
    </>}>
      <div>
        <For each={v().opties!}>{([, label]) => <span class="optie">{label}</span>}</For>
        <Show when={v().anders}>
          <div class="lijnen" />
        </Show>
      </div>
      <Show when={v().type === 'checks'}>
        <span class="klein">Meerdere antwoorden mogelijk.</span>
      </Show>
    </Show>
  );
}

function Vraag(props: { veld: Veld; label?: string }): JSX.Element {
  return (
    <div class="veld">
      <div class="veld-label">{props.label ?? props.veld.label}</div>
      <Show when={props.veld.hint}>
        <div class="klein">{props.veld.hint}</div>
      </Show>
      <Antwoord veld={props.veld} />
    </div>
  );
}

function Delen(props: { titel: string; labels: string[] }): JSX.Element {
  return (
    <table class="tabel">
      <thead>
        <tr>
          <th style={{ width: '30%' }}>{props.titel}</th>
          <th>Oppervlakte (m²)</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.labels}>
          {(l) => (
            <tr>
              <td>{l}</td>
              <td />
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

function Materiaallijst(props: { namen: string[] }): JSX.Element {
  const rijen = () => [...props.namen, '', '', ''];
  return (
    <table class="tabel">
      <thead>
        <tr>
          <th>Materiaal</th>
          <th style={{ width: '20%' }}>Aantal</th>
        </tr>
      </thead>
      <tbody>
        <For each={rijen()}>
          {(n) => (
            <tr>
              <td style={{ height: '22px' }}>{n}</td>
              <td />
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

// One form for both the dossier-specific and the blank variant; `doc` is null for the blank one.
export function Bezoekformulier(props: { doc: Doc | null; standaardMaterialen: string[] }): JSX.Element {
  const d = (): Dossier | null => (props.doc ? props.doc.d : null);
  const items = () => (d() ? kaartItems(d()!) : null);
  const pijpen = () => {
    const i = items();
    return i && i.regenpijpen.length ? i.regenpijpen.map((r) => ({ label: r.label, dak: r.bronnen.length ? bronnenTekst(r, i.labels) : null })) : LEGE_PIJPEN.map((label) => ({ label, dak: null }));
  };
  const daken = () => {
    const i = items();
    return i && i.daken.length ? i.daken.map((x) => x.label) : Array.from({ length: LEGE_DELEN }, (_, n) => `D${n + 1}`);
  };
  const tuinen = () => {
    const i = items();
    return i && i.tuinen.length ? i.tuinen.map((x) => x.label) : Array.from({ length: LEGE_DELEN }, (_, n) => `T${n + 1}`);
  };
  const materialen = () => {
    const x = d();
    return x ? materiaalRijen(x, 'materialen').map((r) => r.naam).filter((n) => n.trim()) : props.standaardMaterialen;
  };
  return (
    <>
      <Show
        when={props.doc}
        fallback={
          <>
            <h1>Bezoekformulier regenwater</h1>
            <For each={['Adres', 'Bewoner', 'Telefoon / e-mail', 'Datum bezoek', 'Bezoeker']}>
              {(l) => (
                <div class="veld">
                  <div class="veld-label">{l}</div>
                  <div class="lijnen" />
                </div>
              )}
            </For>
            <h2>Schets</h2>
            <p class="klein">Teken de dakdelen (D1, D2...), tuindelen (T1, T2...) en regenpijpen (A, B...).</p>
            <div class="vak" style={{ height: '120mm' }} />
          </>
        }
      >
        {(doc) => (
          <>
            <Kop
              doc={doc()}
              titel="Bezoekformulier regenwater"
              extra={[
                ['E-mail', str(doc().d, 'bewoner_email')],
                ['Telefoon', str(doc().d, 'bewoner_telefoon')],
                ['Afspraak', doc().d.afspraak ? datumTijd(doc().d.afspraak!) : null],
              ]}
            />
            <Fotos doc={doc()} slot="straatfoto" onderschrift={adresRegel(doc().d)} />
            <h2>Kaart</h2>
            <Show when={kaartFoto(doc().d)} fallback={<div class="vak" style={{ height: '120mm' }} />}>
              {(k) => (
                <div class="fotos">
                  <figure class="breed">
                    <FotoMetTekening doc={doc()} foto={k()} annots={kaartAnnotaties(doc().d)} mPerPx={k().m_per_px} />
                  </figure>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>

      <h2 class="nieuwe-pagina">Bezoek</h2>
      <Delen titel="Dakdeel" labels={daken()} />
      <Delen titel="Tuindeel" labels={tuinen()} />
      <For each={losseVelden('bezoek')}>{(v) => <Vraag veld={v} />}</For>

      <h2>Regenpijpen</h2>
      <For each={pijpen()}>
        {(p) => (
          <div class="blok">
            <h3>
              Regenpijp {p.label}
              {p.dak ? `, voert af van ${p.dak}` : ''}
            </h3>
            <Show when={!p.dak}>
              <div class="veld">
                <div class="veld-label">Voert af van dakdeel(en)</div>
                <Lijnen n={1} />
              </div>
            </Show>
            <For each={REGENPIJP_VELDEN}>{(v) => <Vraag veld={v} />}</For>
          </div>
        )}
      </For>

      <h2 class="nieuwe-pagina">Plan van Aanpak</h2>
      <For each={losseVelden('plan')}>{(v) => <Vraag veld={v} />}</For>
      <div class="veld">
        <div class="veld-label">Materialen die nodig zijn</div>
        <Materiaallijst namen={materialen()} />
      </div>
    </>
  );
}
