// Uitvoering sub-page (uitvoerder): what was done, opleverfoto's and the materials used.
import { Show, onMount } from 'solid-js';
import { bevestig } from '../ui.tsx';
import { MijlpaalRegel, actie, zetMijlpaal } from './acties.tsx';
import { FotoSlot } from './fotos.tsx';
import { TerugLink } from './pagina.tsx';
import { useDossier } from './staat.ts';
import { MateriaalTabel, VeldInvoer } from './velden.tsx';

export function Uitvoering() {
  const s = useDossier();
  // The server copies the planned rows with an Aantal the first time; afterwards it's a no-op.
  onMount(() => {
    if (s.d.data.gebruikt === undefined && s.mag(['uitvoerder'])) void actie(s, 'gebruikt-vullen');
  });
  const opleveren = async () => {
    const vraag = s.beheerder() ? 'Het werk wordt als opgeleverd geregistreerd.' : 'Hierna kunnen alleen de beheerders het dossier nog wijzigen.';
    if (await bevestig('Werk opgeleverd?', vraag, { ja: 'Werk opgeleverd' })) await zetMijlpaal(s, 'werk_opgeleverd');
  };

  return (
    <>
      <TerugLink />
      <section class="mb-3 qa-uitvoering">
        <div class="d-flex flex-wrap align-items-baseline gap-3 mb-2">
          <h2 class="mb-0">Uitvoering</h2>
          <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="small qa-plan-pdf"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
        </div>
        <VeldInvoer k="uitgevoerd" />
        <div id="veld-opleverfotos" class="mb-3 qa-veld-opleverfotos">
          <div class="form-label fw-semibold mb-1">Opleverfoto’s</div>
          <FotoSlot k="opleverfotos" />
        </div>
        <MateriaalTabel lijst="gebruikt" />
        <MijlpaalRegel mijlpaal="werk_opgeleverd" label="Werk opgeleverd" />
        <Show when={!s.d.werk_opgeleverd_at && s.mag(['uitvoerder'])}>
          <button type="button" class="btn btn-success btn-lg qa-werk-opgeleverd" onClick={() => void opleveren()}>Werk opgeleverd</button>
        </Show>
      </section>
    </>
  );
}
