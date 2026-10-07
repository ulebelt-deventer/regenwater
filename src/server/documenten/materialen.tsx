import { For, type JSX, Show } from 'solid-js';
import { KLUSSENDIENST_PER_REGENPIJP_CENT } from '../../shared/constants.ts';
import { euro, kortDatum } from '../../shared/datum.ts';
import { getal, kaartItems } from '../../shared/kaart.ts';
import { adresRegel, str } from '../../shared/status.ts';
import { materiaalRijen, materiaalTotaal } from '../../shared/velden.ts';
import { type Doc, eigenaar, naamVan } from './onderdelen.tsx';

// The facturatie page: gebruikte materialen with prices, plus the Klussendienst for a koopwoning.
export function MaterialenPrijzen(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const rijen = () => materiaalRijen(d(), 'gebruikt').filter((r) => r.naam.trim() || r.aantal !== null);
  const pijpen = () => kaartItems(d()).regenpijpen.length;
  const klussendienst = () => (d().huur_koop === 'koop' ? pijpen() * KLUSSENDIENST_PER_REGENPIJP_CENT : 0);
  const kopRijen = (): [string, string | null][] => [
    ['Adres', adresRegel(d())],
    ['Bewoner', str(d(), 'bewoner_naam')],
    ['Woningeigenaar', eigenaar(d())],
    ['Uitvoerder', naamVan(props.doc, d().uitvoerder_id)],
    ['Opgeleverd op', d().werk_opgeleverd_at ? kortDatum(d().werk_opgeleverd_at!) : null],
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
      <h1>Materialen met prijzen</h1>
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
      <table class="tabel qa-materialen-prijzen">
        <thead>
          <tr>
            <th>Materiaal</th>
            <th class="getal">Prijs</th>
            <th class="getal">Aantal</th>
            <th class="getal">Subtotaal</th>
          </tr>
        </thead>
        <tbody>
          <For each={rijen()}>
            {(r) => (
              <tr>
                <td>{r.naam}</td>
                <td class="getal">{r.prijs === null ? '--' : euro(r.prijs)}</td>
                <td class="getal">{r.aantal === null ? '--' : getal(r.aantal)}</td>
                <td class="getal">{r.prijs !== null && r.aantal !== null ? euro(Math.round(r.prijs * r.aantal)) : '--'}</td>
              </tr>
            )}
          </For>
          <Show when={d().huur_koop === 'koop'}>
            <tr class="qa-klussendienst">
              <td colSpan={3}>
                Klussendienst: {pijpen()} regenpijpen × {euro(KLUSSENDIENST_PER_REGENPIJP_CENT)}
              </td>
              <td class="getal">{euro(klussendienst())}</td>
            </tr>
          </Show>
          <tr>
            <th colSpan={3}>Totaal</th>
            <th class="getal qa-totaal">{euro(materiaalTotaal(rijen()) + klussendienst())}</th>
          </tr>
        </tbody>
      </table>
    </>
  );
}
