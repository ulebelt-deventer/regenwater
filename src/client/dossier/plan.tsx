// Plan van Aanpak sub-page (bezoeker after the bezoek, then admin during review): what we'll do.
import { Show } from 'solid-js';
import { KLUSSENDIENST_PER_REGENPIJP_CENT } from '../../shared/constants.ts';
import { euro } from '../../shared/datum.ts';
import { klussendienstKosten } from '../../shared/specificatie.ts';
import { MijlpaalRegel } from './acties.tsx';
import { Controle, afronden } from './bezoek.tsx';
import { TerugLink, useNaarSectie } from './pagina.tsx';
import { useDossier } from './staat.ts';
import { MateriaalTabel, VeldInvoer } from './velden.tsx';

export function Plan() {
  const s = useDossier();
  const naarSectie = useNaarSectie();
  const toelichtingNodig = () => {
    const b = s.d.data.beoordeling;
    return typeof b === 'string' && b !== 'uitvoerbaar' && !s.d.data.beoordeling_toelichting;
  };
  const klussendienstHint = () => {
    const k = klussendienstKosten(s.d);
    return `Excl. btw. Reken ongeveer ${euro(KLUSSENDIENST_PER_REGENPIJP_CENT)} per regenpijp die wordt afgekoppeld; hier ${k.pijpen} × ${euro(KLUSSENDIENST_PER_REGENPIJP_CENT)} = ${euro(k.bedrag)}.`;
  };

  return (
    <>
      <TerugLink sectie="sectie-plan" />
      <section class="mb-3 qa-plan">
        <div class="d-flex flex-wrap align-items-baseline gap-3 mb-2">
          <h2 class="mb-0">Plan van Aanpak</h2>
          <a href={`/docs/dossiers/${s.id}/concept-plan`} target="_blank" class="small qa-concept-plan">Bekijk concept-Plan</a>
        </div>

        <h3 class="text-muted mt-2">Voorstel Ulebelt</h3>
        <VeldInvoer k="beoordeling" />
        <VeldInvoer k="beoordeling_toelichting" />
        <Show when={toelichtingNodig()}>
          <div class="small text-warning mt-n2 mb-3 qa-toelichting-nodig">Licht de beoordeling toe voor de bewoner en de woningcorporatie.</div>
        </Show>
        <VeldInvoer k="voorstel" />

        <MateriaalTabel lijst="materialen" />
        <VeldInvoer k="klussendienst_kosten" hint={klussendienstHint()} />

        <Controle s={s} pagina="plan" />
        <MijlpaalRegel mijlpaal="klaar_voor_controle" label="Klaar voor controle" />
        <Show when={!s.d.klaar_voor_controle_at && s.mag(['bezoeker'])}>
          <button
            type="button"
            class="btn btn-success btn-lg qa-klaar-voor-controle"
            onClick={async () => (await afronden(s, 'plan', 'klaar_voor_controle', s.beheerder() ? undefined : 'Hierna kunnen alleen de beheerders het dossier nog wijzigen.')) && naarSectie('sectie-plan')}
          >
            Klaar voor controle
          </button>
        </Show>
        <div class="mt-3 text-center">
          <TerugLink sectie="sectie-plan" class="" />
        </div>
      </section>
    </>
  );
}
