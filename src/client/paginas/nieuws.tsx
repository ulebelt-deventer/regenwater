// Wat is er nieuw (admin): user-visible changes from shared/nieuws.ts. Opening it clears the red dot in the Beheer menu.
import { For, onMount } from 'solid-js';
import { datum } from '../../shared/datum.ts';
import { NIEUWS } from '../../shared/nieuws.ts';
import { post } from '../api.ts';
import { laadSessie } from '../sessie.ts';
import { AlleenBeheerder, probeer, titel } from '../ui.tsx';

export function Nieuws() {
  titel('Wat is er nieuw');
  return (
    <AlleenBeheerder>
      <NieuwsInhoud />
    </AlleenBeheerder>
  );
}

function NieuwsInhoud() {
  onMount(() => void probeer(async () => {
    await post('/api/nieuws/gezien');
    await laadSessie();
  }));
  return (
    <>
      <h1>Wat is er nieuw</h1>
      <p class="text-muted">De belangrijkste veranderingen in de app, de nieuwste bovenaan.</p>
      <For each={NIEUWS}>
        {(n) => (
          <section class="mb-4 qa-nieuws-datum">
            <h2 class="border-bottom pb-1">{datum(n.datum)}</h2>
            <For each={n.groepen}>
              {(g) => (
                <>
                  <h3 class="mt-3">{g.kop}</h3>
                  <ul>
                    <For each={g.punten}>{(p) => <li>{p}</li>}</For>
                  </ul>
                </>
              )}
            </For>
          </section>
        )}
      </For>
    </>
  );
}
