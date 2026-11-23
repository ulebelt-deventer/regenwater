// Uitvoering sub-page (uitvoerder): what was done, which regenpijpen were afgekoppeld, opleverfoto's and the materials used.
import { For, Show, onMount } from 'solid-js';
import { kaartItems } from '../../shared/kaart.ts';
import { opleverFout, teAfkoppelen, veldTekst } from '../../shared/velden.ts';
import { bevestig, melding } from '../ui.tsx';
import { MijlpaalRegel, actie, zetMijlpaal } from './acties.tsx';
import { FotoSlot } from './fotos.tsx';
import { TerugLink, useNaarSectie } from './pagina.tsx';
import { useDossier } from './staat.ts';
import { MateriaalTabel, VeldInvoer } from './velden.tsx';

export function Uitvoering() {
  const s = useDossier();
  const naarSectie = useNaarSectie();
  // The server copies the planned rows with an Aantal the first time; afterwards it's a no-op.
  onMount(() => {
    if (s.d.data.gebruikt === undefined && s.mag(['uitvoerder'])) void actie(s, 'gebruikt-vullen');
  });
  const teBevestigen = () => kaartItems(s.d).regenpijpen.filter((r) => teAfkoppelen(s.d, r.id));
  const opleveren = async () => {
    const reden = opleverFout(s.d);
    if (reden) {
      melding('danger', reden);
      return;
    }
    const vraag = s.beheerder() ? 'Het werk wordt als opgeleverd geregistreerd.' : 'Hierna kunnen alleen de beheerders het dossier nog wijzigen.';
    if ((await bevestig('Werk opgeleverd?', vraag, { ja: 'Werk opgeleverd' })) && (await zetMijlpaal(s, 'werk_opgeleverd'))) naarSectie('sectie-uitvoering');
  };

  return (
    <>
      <TerugLink sectie="sectie-uitvoering" />
      <section class="mb-3 qa-uitvoering">
        <div class="d-flex flex-wrap align-items-baseline gap-3 mb-2">
          <h2 class="mb-0">Uitvoering</h2>
          <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="small qa-plan-pdf"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
        </div>
        <VeldInvoer k="uitgevoerd" />
        <Show when={teBevestigen().length}>
          <div class="mb-3 qa-afgekoppeld">
            <div class="form-label fw-semibold mb-1">Regenpijpen</div>
            <div class="form-text mt-0 mb-2">Geef per regenpijp die volgens het Plan van Aanpak wordt afgekoppeld aan of dat is gebeurd.</div>
            <For each={teBevestigen()}>{(r) => <VeldInvoer k={`regenpijp.${r.id}.afgekoppeld`} label={`Regenpijp ${r.label}: afgekoppeld?`} class="mb-2" />}</For>
          </div>
        </Show>
        <div id="veld-opleverfotos" class="mb-3 qa-veld-opleverfotos">
          <div class="form-label fw-semibold mb-1">Opleverfoto’s</div>
          <FotoSlot k="opleverfotos" />
        </div>
        <MateriaalTabel lijst="gebruikt" />
        {/* Read-only: the uitvoerder sees what the bewoner pays, so they can tell an admin when the work went differently. */}
        <Show when={s.d.huur_koop === 'koop'}>
          <div class="mb-3 qa-klussendienst-afgesproken">
            <div class="fw-semibold">Afgesproken kosten Klussendienst: {veldTekst(s.d, 'klussendienst_kosten') ?? 'nog niet afgesproken'}</div>
            <div class="form-text mt-0">Dit bedrag betaalt de bewoner, zoals afgesproken in het Plan van Aanpak. Ging het werk anders dan in het plan, laat het dan een beheerder weten.</div>
          </div>
        </Show>
        <MijlpaalRegel mijlpaal="werk_opgeleverd" label="Werk opgeleverd" />
        <Show when={!s.d.werk_opgeleverd_at && s.mag(['uitvoerder'])}>
          <div>
            <button type="button" class="btn btn-success btn-lg qa-werk-opgeleverd" onClick={() => void opleveren()}>Werk opgeleverd</button>
          </div>
        </Show>
        <div class="mt-3 text-center">
          <TerugLink sectie="sectie-uitvoering" class="" />
        </div>
      </section>
    </>
  );
}
