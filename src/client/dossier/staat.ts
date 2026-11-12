// One loaded dossier for its details page and sub-pages: a store edited optimistically, with unsent queue values laid over every fresh copy.
import { createContext, createMemo, createSignal, onCleanup, useContext } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { aandacht, klusserHerinnering } from '../../shared/aandacht.ts';
import { isBeheerder, magBewerken } from '../../shared/rechten.ts';
import { inIjskast, status } from '../../shared/status.ts';
import type { Dossier, Gebruiker, Json } from '../../shared/types.ts';
import type { Bewerker } from '../../shared/velden.ts';
import { get } from '../api.ts';
import { type Item, luister, wachtend, zetInWachtrij } from '../opslag.ts';
import { ik, nu, zetServerTijd } from '../sessie.ts';

const KOLOMMEN = new Set(['huur_koop', 'afspraak', 'uitvoering_gepland']);

export interface Antwoord {
  dossier: Dossier;
  gebruikers: Gebruiker[];
  nu: string;
  dubbel: { id: number; gesloten: boolean }[];
}

function pasToe(d: Dossier, item: Item): void {
  if (item.soort === 'veld') {
    if (KOLOMMEN.has(item.key)) (d as unknown as Record<string, Json>)[item.key] = item.value;
    else if (item.value === null) delete d.data[item.key];
    else d.data[item.key] = item.value;
  } else {
    const f = d.fotos.find((x) => x.id === item.fotoId);
    if (f) f.annotaties = item.value;
  }
}

export async function haalDossier(id: number): Promise<Antwoord> {
  const r = await get<Antwoord>(`/api/dossiers/${id}`);
  zetServerTijd(r.nu);
  return r;
}

// Call inside a component, so the queue listener and memos belong to its owner and end with it.
export function maakStaat(id: number, eerste: Antwoord) {
  const metWachtrij = (d: Dossier) => {
    const kopie = structuredClone(d);
    for (const item of wachtend(id)) pasToe(kopie, item);
    return kopie;
  };
  const [d, setD] = createStore<Dossier>(metWachtrij(eerste.dossier));
  const [gebruikers, setGebruikers] = createSignal(eerste.gebruikers);
  const [dubbel, setDubbel] = createSignal(eerste.dubbel);
  const [klok, setKlok] = createSignal(nu());
  const [kaartVervangen, setKaartVervangen] = createSignal(false);

  const vervang = (nieuw: Dossier) => {
    setD(reconcile(metWachtrij(nieuw)));
    setKlok(nu());
  };
  const herlaad = async () => {
    const r = await haalDossier(id);
    setGebruikers(r.gebruikers);
    setDubbel(r.dubbel);
    vervang(r.dossier);
  };

  const stop = luister(id, {
    opgeslagen: (_item, planAt) => setD('plan_gewijzigd_at', planAt),
    afgewezen: () => void herlaad(),
    foto: (f, _slot, vervangId, planAt) => {
      setD('fotos', (fs) => [...fs.filter((x) => x.id !== vervangId), f]);
      if (planAt) setD('plan_gewijzigd_at', planAt);
    },
  });
  onCleanup(stop);

  const gm = createMemo(() => new Map(gebruikers().map((g) => [g.id, g])));
  const beheerder = () => isBeheerder(ik());

  return {
    id,
    d,
    gebruikers,
    gm,
    dubbel,
    setDubbel,
    vervang,
    herlaad,
    status: createMemo(() => status(d)),
    aandacht: createMemo(() => (beheerder() ? aandacht(d, gm(), klok()) : null)),
    herinnering: createMemo(() => (beheerder() ? null : klusserHerinnering(d, ik().id, gm(), klok()))),
    ijskast: createMemo(() => inIjskast(d, klok())),
    beheerder,
    mag: (bewerkers: Bewerker[]) => magBewerken(ik(), d, bewerkers),
    naam: (gid: number | null) => (gid === null ? null : gm().get(gid)!.naam),
    // Autosaves one field: the store changes now, the queue sends it.
    zet(key: string, value: Json) {
      setD(produce((x) => pasToe(x, { soort: 'veld', dossierId: id, key, value })));
      zetInWachtrij({ soort: 'veld', dossierId: id, key, value });
    },
    zetAnnotaties(fotoId: string, value: Dossier['fotos'][number]['annotaties']) {
      setD(produce((x) => pasToe(x, { soort: 'annotaties', dossierId: id, fotoId, value })));
      zetInWachtrij({ soort: 'annotaties', dossierId: id, fotoId, value });
    },
    verwijderFoto(fotoId: string, planAt: string | null) {
      setD('fotos', (fs) => fs.filter((f) => f.id !== fotoId));
      if (planAt) setD('plan_gewijzigd_at', planAt);
    },
    // Set once the kaart photo is swapped while drawings exist, so the drawer warns they may no longer line up.
    kaartVervangen,
    setKaartVervangen,
  };
}

export type DossierStaat = ReturnType<typeof maakStaat>;

export const DossierCtx = createContext<DossierStaat>();

export function useDossier(): DossierStaat {
  const s = useContext(DossierCtx);
  if (!s) throw new Error('useDossier buiten een dossierpagina');
  return s;
}
