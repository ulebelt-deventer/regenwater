// Alle activiteit of one dossier (admin). `?sinds=` narrows it to what changed after a send, from "Wat is er gewijzigd?".
import { A, useSearchParams } from '@solidjs/router';
import { Match, Show, Switch, createResource } from 'solid-js';
import { datumTijd } from '../../shared/datum.ts';
import type { Gebruiker } from '../../shared/types.ts';
import { ActiviteitLijst, type AuditItem, TYPE_LABEL } from '../activiteit.tsx';
import { get } from '../api.ts';
import { AlleenBeheerder, Laden } from '../ui.tsx';
import { TerugLink } from './pagina.tsx';
import { useDossier } from './staat.ts';

export function naamUit(gebruikers: Map<number, string>) {
  return (id: number) => {
    const naam = gebruikers.get(id);
    if (naam === undefined) throw new Error(`Onbekende gebruiker ${id}`);
    return naam;
  };
}

export function DossierActiviteit() {
  return (
    <AlleenBeheerder>
      <Inhoud />
    </AlleenBeheerder>
  );
}

function Inhoud() {
  const s = useDossier();
  const [params] = useSearchParams();
  const [antwoord] = createResource(() => get<{ items: AuditItem[]; gebruikers: Gebruiker[] }>(`/api/dossiers/${s.id}/activiteit`));
  const sinds = () => (typeof params.sinds === 'string' ? params.sinds : null);
  const naam = () => naamUit(new Map(antwoord()!.gebruikers.map((g) => [g.id, g.naam])));
  const items = () => {
    const alle = antwoord()!.items;
    const vanaf = sinds();
    return vanaf === null ? alle : alle.filter((i) => i.updated_at >= vanaf);
  };
  const wie = (i: AuditItem) => (i.actor_id === null ? 'Systeem' : naam()(i.actor_id));

  return (
    <>
      <TerugLink />
      <section class="card card-body mb-3 qa-dossier-activiteit">
        <Switch fallback={<Laden />}>
          <Match when={antwoord.state === 'errored'}>
            <div class="alert alert-danger mb-0">{(antwoord.error as Error).message}</div>
          </Match>
          <Match when={antwoord.state === 'ready'}>
            <div class="d-flex flex-wrap align-items-baseline gap-3 mb-2">
              <h2 class="h5 mb-0">Alle activiteit</h2>
              <span class="small text-muted qa-aantal">{items().length} {items().length === 1 ? 'gebeurtenis' : 'gebeurtenissen'}</span>
              <Show when={items()[0]}>
                {(laatste) => (
                  <span class="small text-muted qa-laatste">
                    Laatst: {TYPE_LABEL[laatste().type] ?? laatste().type} op {datumTijd(laatste().updated_at)} door {wie(laatste())}
                  </span>
                )}
              </Show>
            </div>
            <Show when={sinds()}>
              {(v) => (
                <div class="alert alert-info py-2 small qa-sinds">
                  Alleen wat er sinds {datumTijd(v())} is gebeurd. <A href={`/dossiers/${s.id}/activiteit`}>Toon alles</A>
                </div>
              )}
            </Show>
            <Show when={items().length} fallback={<div class="text-muted qa-geen-activiteit">Geen activiteit.</div>}>
              <ActiviteitLijst items={items()} naam={naam()} />
            </Show>
          </Match>
        </Switch>
      </section>
    </>
  );
}
