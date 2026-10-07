import type { Bewerker } from './velden.ts';
import type { Dossier, Gebruiker, Mijlpaal } from './types.ts';

// One permission model for server checks and for which inputs the client enables.

export function isBeheerder(g: Gebruiker): boolean {
  return g.rol === 'beheerder';
}

export function magZien(g: Gebruiker, d: Dossier): boolean {
  return isBeheerder(g) || d.bezoeker_id === g.id || d.uitvoerder_id === g.id;
}

// The klusser roles this user may still edit in: a bezoeker until "Klaar voor controle", an uitvoerder until "Werk opgeleverd".
export function actieveRollen(g: Gebruiker, d: Dossier): Bewerker[] {
  const uit: Bewerker[] = [];
  if (d.bezoeker_id === g.id && !d.klaar_voor_controle_at) uit.push('bezoeker');
  if (d.uitvoerder_id === g.id && !d.werk_opgeleverd_at) uit.push('uitvoerder');
  return uit;
}

// A closed dossier is read-only for everyone.
export function magBewerken(g: Gebruiker, d: Dossier, bewerkers: Bewerker[]): boolean {
  if (d.gesloten_at) return false;
  if (isBeheerder(g)) return true;
  const rollen = actieveRollen(g, d);
  return bewerkers.some((b) => rollen.includes(b));
}

// Milestones a klusser taps themselves; every other milestone is set by a beheerder.
export const MIJLPAAL_BEWERKER: Partial<Record<Mijlpaal, Bewerker>> = {
  bezoek_afgerond: 'bezoeker',
  klaar_voor_controle: 'bezoeker',
  werk_opgeleverd: 'uitvoerder',
};

export function magMijlpaal(g: Gebruiker, d: Dossier, m: Mijlpaal): boolean {
  const b = MIJLPAAL_BEWERKER[m];
  return magBewerken(g, d, b ? [b] : []);
}
