import { createSignal } from 'solid-js';
import type { Gebruiker, Omgeving } from '../shared/types.ts';
import { ApiFout, get } from './api.ts';

export interface Sessie {
  ik: Gebruiker; // whose view this is (the klusser during "Inloggen als")
  actor: Gebruiker | null; // the admin behind "Inloggen als", else null
}

const [sessie, setSessie] = createSignal<Sessie | null>(null);
export { sessie };

const [omgeving, setOmgeving] = createSignal<Omgeving>(null);
export { omgeving };
export async function laadOmgeving(): Promise<void> {
  setOmgeving((await get<{ omgeving: Omgeving }>('/api/omgeving')).omgeving);
}

// The server's clock minus ours, so aandacht and "is this in the future" use server time (the test clock included).
let klokVerschil = 0;
export function nu(): Date {
  return new Date(Date.now() + klokVerschil);
}
export function zetServerTijd(iso: string): void {
  klokVerschil = new Date(iso).getTime() - Date.now();
}

export async function laadSessie(): Promise<Sessie | null> {
  try {
    const me = await get<{ ik: Gebruiker; actor: Gebruiker | null; nu: string }>('/api/auth/me');
    zetServerTijd(me.nu);
    setSessie({ ik: me.ik, actor: me.actor });
  } catch (e) {
    if (!(e instanceof ApiFout && e.status === 401)) throw e;
    setSessie(null);
  }
  return sessie();
}

export function ik(): Gebruiker {
  const s = sessie();
  if (!s) throw new Error('Niet ingelogd');
  return s.ik;
}

export const isBeheerderNu = () => ik().rol === 'beheerder';
