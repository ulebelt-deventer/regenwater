import { For, type JSX } from 'solid-js';
import { BTW_PROCENT } from '../../shared/constants.ts';
import { euro } from '../../shared/datum.ts';
import { getal } from '../../shared/kaart.ts';
import { klussendienstRegel, specificatie, specificatieKop, specificatieTekst } from '../../shared/specificatie.ts';
import { type Doc, Merk, naamVan } from './onderdelen.tsx';

const KNOPPEN_SCRIPT = `
document.querySelector('.qa-afdrukken').addEventListener('click', () => window.print());
const kopieer = document.querySelector('.qa-kopieren');
kopieer.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('.qa-specificatie-tekst').value);
    kopieer.textContent = 'Gekopieerd ✓';
  } catch (e) {
    alert('Kopiëren lukte niet: ' + e.message);
  }
});`;

// The Uitvoeringsspecificatie as a print-friendly page, with a button that copies its text version for a mail.
export function Uitvoeringsspecificatie(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const s = () => specificatie(d());
  const uitvoerder = () => naamVan(props.doc, d().uitvoerder_id);
  return (
    <>
      <Merk />
      <div class="knoppen geen-print">
        <button type="button" class="knop qa-afdrukken">
          Afdrukken
        </button>
        <button type="button" class="knop qa-kopieren">
          Kopieer als tekst
        </button>
      </div>
      <textarea hidden class="qa-specificatie-tekst">{specificatieTekst(d(), uitvoerder())}</textarea>
      {/* Server-rendered without hydration, so Solid event handlers would be dropped. */}
      <script innerHTML={KNOPPEN_SCRIPT} />
      <h1>Uitvoeringsspecificatie</h1>
      <table class="kop-tabel">
        <tbody>
          <For each={specificatieKop(d(), uitvoerder())}>
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
          <tr class="qa-klussendienst">
            <td colSpan={3}>{klussendienstRegel(s().klussendienst)}</td>
            <td class="getal">{euro(s().klussendienst.bedrag)}</td>
          </tr>
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
