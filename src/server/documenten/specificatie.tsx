import { For, type JSX, Show } from 'solid-js';
import { BTW_PROCENT } from '../../shared/constants.ts';
import { euro, kortDatum } from '../../shared/datum.ts';
import { getal } from '../../shared/kaart.ts';
import { klussendienstRegel, project, specificatie } from '../../shared/specificatie.ts';
import { str, straatNummer } from '../../shared/status.ts';
import { type Doc, eigenaar, naamVan } from './onderdelen.tsx';

// The Uitvoeringsspecificatie as a print-friendly page; the copyable text version is specificatieTekst.
export function Uitvoeringsspecificatie(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const s = () => specificatie(d());
  const a = () => d().adres!;
  const kopRijen = (): [string, string | null][] => [
    ['Project', project(d())],
    ['Bewoner', str(d(), 'bewoner_naam')],
    ['Adres', `${straatNummer(a())}, ${a().postcode} ${a().plaats}`],
    ['E-mail', str(d(), 'bewoner_email')],
    ['Woningeigenaar', eigenaar(d())],
    ['Uitvoerder', naamVan(props.doc, d().uitvoerder_id)],
    ['Opgeleverd op', kortDatum(d().werk_opgeleverd_at!)],
  ];
  return (
    <>
      <div class="knoppen geen-print">
        <button type="button" class="knop qa-afdrukken">
          Afdrukken
        </button>
      </div>
      {/* Server-rendered without hydration, so Solid event handlers would be dropped. */}
      <script innerHTML="document.querySelector('.qa-afdrukken').addEventListener('click', () => window.print())" />
      <h1>Uitvoeringsspecificatie</h1>
      <table class="kop-tabel">
        <tbody>
          <For each={kopRijen()}>
            {([l, v]) => (
              <tr>
                <td>{l}:</td>
                <td>{v === null ? '--' : v}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <table class="tabel qa-specificatie">
        <thead>
          <tr>
            <th>Omschrijving</th>
            <th class="getal">Prijs excl. btw</th>
            <th class="getal">Aantal</th>
            <th class="getal">Bedrag</th>
          </tr>
        </thead>
        <tbody>
          <For each={s().regels}>
            {(r) => (
              <tr class="qa-specificatie-regel">
                <td>{r.naam}</td>
                <td class="getal">{r.prijs === null ? '--' : euro(r.prijs)}</td>
                <td class="getal">{getal(r.aantal)}</td>
                <td class="getal">{r.bedrag === null ? '--' : euro(r.bedrag)}</td>
              </tr>
            )}
          </For>
          <Show when={s().klussendienst} keyed>
            {(k) => (
              <tr class="qa-klussendienst">
                <td colSpan={3}>{klussendienstRegel(k)}</td>
                <td class="getal">{euro(k.bedrag)}</td>
              </tr>
            )}
          </Show>
          <tr>
            <td colSpan={3}>Subtotaal</td>
            <td class="getal qa-subtotaal">{euro(s().subtotaal)}</td>
          </tr>
          <tr>
            <td colSpan={3}>btw {BTW_PROCENT}%</td>
            <td class="getal qa-btw">{euro(s().btw)}</td>
          </tr>
          <tr>
            <th colSpan={3}>Totaal</th>
            <th class="getal qa-totaal">{euro(s().totaal)}</th>
          </tr>
        </tbody>
      </table>
      <For each={s().waarschuwingen}>{(w) => <p class="qa-specificatie-waarschuwing"><strong>Let op:</strong> {w}</p>}</For>
    </>
  );
}
