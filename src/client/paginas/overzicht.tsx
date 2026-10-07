import { A, Navigate, useNavigate } from '@solidjs/router';
import { For, Show, createResource } from 'solid-js';
import { datum } from '../../shared/datum.ts';
import type { Gebruiker } from '../../shared/types.ts';
import { get } from '../api.ts';
import { sessie } from '../sessie.ts';
import { Laden, titel } from '../ui.tsx';

export interface GebruikerRij extends Gebruiker {
  open: number;
  gesloten: number;
}

const KLEUR: Record<string, string> = { aandacht: 'text-danger fw-semibold', gesloten: 'text-secondary', uitgevoerd: 'text-success' };

export function RolBadge(props: { rol: string }) {
  return <span class={`badge ${props.rol === 'beheerder' ? 'text-bg-primary' : 'bij-klusser'} qa-rol`}>{props.rol === 'beheerder' ? 'Beheerder' : 'Klusser'}</span>;
}

export function Overzicht() {
  return (
    <Show when={sessie()!.ik.rol === 'beheerder'} fallback={<Navigate href="/dossiers" />}>
      <OverzichtInhoud />
    </Show>
  );
}

function OverzichtInhoud() {
  titel('Overzicht');
  const navigate = useNavigate();
  const [data] = createResource(() => get<{ tellingen: { key: string; label: string; aantal: number; query: string }[]; gebruikers: GebruikerRij[] }>('/api/overzicht'));
  return (
    <>
      <h1 class="h3 mb-3">Overzicht</h1>
      <Show when={data()} fallback={<Laden />}>
        {(d) => (
          <>
            <table class="table w-auto mb-4 qa-tellingen">
              <tbody>
                <For each={d().tellingen}>
                  {(t) => (
                    <tr class={`qa-telling-${t.key}`}>
                      <td class={KLEUR[t.key] ?? ''}>{t.label}</td>
                      <td class={`text-end fw-semibold qa-aantal ${KLEUR[t.key] ?? ''}`}>{t.aantal}</td>
                      <td>
                        <A href={`/dossiers${t.query ? `?${t.query}` : ''}`} class="qa-lijst-link">Bekijk lijst</A>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <h2 class="h5">Gebruikers</h2>
            <div class="table-responsive">
              <table class="table table-hover qa-gebruikers">
                <thead>
                  <tr>
                    <th>Naam</th>
                    <th>Rol</th>
                    <th>Laatst actief</th>
                    <th class="text-end">Open dossiers</th>
                    <th class="text-end">Gesloten dossiers</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={d().gebruikers}>
                    {(g) => (
                      <tr class="row-link" onClick={() => navigate(`/gebruikers/${g.id}`)}>
                        <td>{g.naam}</td>
                        <td><RolBadge rol={g.rol} /></td>
                        <td>{g.last_active_at ? datum(g.last_active_at) : '--'}</td>
                        <td class="text-end">{g.open}</td>
                        <td class="text-end">{g.gesloten}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <div class="text-center mt-4">
              <A href="/dossiers" class="btn btn-primary">Alle dossiers zien</A>
            </div>
          </>
        )}
      </Show>
    </>
  );
}
