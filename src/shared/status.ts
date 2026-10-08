import { CORPORATIE_EMAIL } from './constants.ts';
import { lokaal } from './datum.ts';
import type { Adres, Dossier, Ontvanger, Verzending } from './types.ts';

export type LigtBij = 'beheerder' | 'klusser' | 'corporatie' | 'bewoner';

export const LIGT_BIJ_LABEL: Record<LigtBij, string> = {
  beheerder: 'Beheerder',
  klusser: 'Klusser',
  corporatie: 'Woningcorporatie',
  bewoner: 'Bewoner',
};

export const SUBSIDIE_SJABLONEN = ['subsidie_huur', 'subsidie_koop', 'subsidie_niet'];
export const PLAN_BEWONER_SJABLONEN = ['plan_bewoner_huur', 'plan_bewoner_koop'];

export function geslaagd(d: Dossier): Verzending[] {
  return d.verzendingen.filter((v) => v.mislukt_at === null);
}

export function eersteVerzending(d: Dossier, sjablonen: string[]): Verzending | null {
  return geslaagd(d).find((v) => sjablonen.includes(v.sjabloon)) ?? null;
}

export function laatsteVerzending(d: Dossier, sjablonen: string[]): Verzending | null {
  const v = geslaagd(d).filter((x) => sjablonen.includes(x.sjabloon));
  return v.length ? v[v.length - 1] : null;
}

// Plan sends per recipient, the basis for steps 6-8 and for Plan gewijzigd.
export const PLAN_SJABLONEN: Partial<Record<Ontvanger, string[]>> = {
  bewoner: PLAN_BEWONER_SJABLONEN,
  corporatie: ['plan_corporatie'],
  uitvoerder: ['uitvoerder_toegewezen'],
};

export function str(d: Dossier, key: string): string | null {
  const v = d.data[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

// Shown as a warning on the intake page; the admin decides when the intake is complete.
export function intakeOntbreekt(d: Dossier): string[] {
  const uit: string[] = [];
  if (!d.adres) uit.push('adres');
  if (!str(d, 'bewoner_naam')) uit.push('naam bewoner');
  if (!str(d, 'bewoner_email')) uit.push('e-mail bewoner');
  if (!d.huur_koop) uit.push('huur/koop');
  if (!str(d, 'rioolstelsel')) uit.push('rioolstelsel');
  if (!eersteVerzending(d, SUBSIDIE_SJABLONEN)) uit.push('subsidiemail');
  return uit;
}

export interface Stap {
  nr: number;
  key: string;
  ligtBij: LigtBij;
  label: string;
  regel: string; // the "current while" text on the Statussen page
  anker: string; // section id on the details page
  geldt: (d: Dossier) => boolean;
  // When the step was completed, or null. Steps 3 and 11 have no meaningful time, so they return their stored value.
  gedaan: (d: Dossier) => string | null;
}

export const STAPPEN: Stap[] = [
  {
    nr: 1, key: 'intake', ligtBij: 'beheerder', label: 'Intake', anker: 'sectie-intake',
    regel: '"Intake is compleet" is nog niet aangetikt',
    geldt: () => true,
    gedaan: (d) => d.intake_afgerond_at,
  },
  {
    nr: 2, key: 'bezoeker', ligtBij: 'beheerder', label: 'Bezoeker toewijzen', anker: 'sectie-bezoeker',
    regel: 'Nog geen bezoeker toegewezen',
    geldt: () => true,
    gedaan: (d) => (d.bezoeker_id !== null ? d.bezoeker_toegewezen_at : null),
  },
  {
    nr: 3, key: 'afspraak', ligtBij: 'klusser', label: 'Bezoek plannen', anker: 'sectie-bezoek',
    regel: 'Nog geen afspraakdatum',
    geldt: () => true,
    gedaan: (d) => d.afspraak,
  },
  {
    nr: 4, key: 'bezoek', ligtBij: 'klusser', label: 'Bezoek uitvoeren', anker: 'sectie-bezoek',
    regel: '"Bezoek afronden" is nog niet aangetikt',
    geldt: () => true,
    gedaan: (d) => d.bezoek_afgerond_at,
  },
  {
    nr: 5, key: 'plan', ligtBij: 'klusser', label: 'Plan van Aanpak afronden', anker: 'sectie-plan',
    regel: '"Klaar voor controle" is nog niet aangetikt',
    geldt: () => true,
    gedaan: (d) => d.klaar_voor_controle_at,
  },
  {
    nr: 6, key: 'versturen', ligtBij: 'beheerder', label: 'Plan controleren & versturen', anker: 'sectie-versturen',
    regel: 'Plan nog niet verstuurd (naar de woningcorporatie bij huur, naar de bewoner bij koop)',
    geldt: () => true,
    gedaan: (d) => {
      if (d.huur_koop === null) return null;
      const v = laatsteVerzending(d, d.huur_koop === 'huur' ? ['plan_corporatie'] : PLAN_BEWONER_SJABLONEN);
      return v ? v.created_at : null;
    },
  },
  {
    nr: 7, key: 'akkoord_huur', ligtBij: 'corporatie', label: 'Plan goedkeuren (huur)', anker: 'sectie-versturen',
    regel: 'Goedkeuring van de woningcorporatie nog niet geregistreerd',
    geldt: (d) => d.huur_koop === 'huur',
    gedaan: (d) => d.corporatie_akkoord_at,
  },
  {
    nr: 8, key: 'keuze_koop', ligtBij: 'bewoner', label: 'Klussendienst of zelf? (koop)', anker: 'sectie-versturen',
    regel: 'Keuze van de bewoner nog niet geregistreerd',
    geldt: (d) => d.huur_koop === 'koop',
    gedaan: (d) => d.klussendienst_gekozen_at,
  },
  {
    nr: 9, key: 'uitvoerder', ligtBij: 'beheerder', label: 'Uitvoerder toewijzen', anker: 'sectie-uitvoerder',
    regel: 'Nog geen uitvoerder toegewezen',
    geldt: () => true,
    gedaan: (d) => (d.uitvoerder_id !== null ? d.uitvoerder_toegewezen_at : null),
  },
  {
    nr: 10, key: 'uitvoering', ligtBij: 'klusser', label: 'Werk uitvoeren', anker: 'sectie-uitvoering',
    regel: '"Werk opgeleverd" is nog niet aangetikt',
    geldt: () => true,
    gedaan: (d) => d.werk_opgeleverd_at,
  },
  {
    nr: 11, key: 'oplevering', ligtBij: 'beheerder', label: 'Opleverrapport versturen', anker: 'sectie-oplevering',
    regel: 'Nog niet gesloten als Uitgevoerd',
    geldt: () => true,
    gedaan: (d) => (d.gesloten_reden === 'Uitgevoerd' ? d.gesloten_at : null),
  },
];

export function stap(key: string): Stap {
  const s = STAPPEN.find((x) => x.key === key);
  if (!s) throw new Error(`Onbekende stap: ${key}`);
  return s;
}

// The first applicable step that isn't done. Every step done means closed as Uitgevoerd, so step 11 is the fallback.
export function huidigeStap(d: Dossier): Stap {
  return STAPPEN.find((s) => s.geldt(d) && s.gedaan(d) === null) ?? STAPPEN[STAPPEN.length - 1];
}

export interface Status {
  gesloten: boolean;
  stap: Stap;
  label: string;
  ligtBij: LigtBij | null;
}

export function status(d: Dossier): Status {
  const s = huidigeStap(d);
  if (d.gesloten_at) return { gesloten: true, stap: s, label: `Gesloten: ${d.gesloten_reden}`, ligtBij: null };
  return { gesloten: false, stap: s, label: s.label, ligtBij: s.ligtBij };
}

// Status filter on the dossiers list: "is this milestone recorded".
export const STATUS_FILTERS: { key: string; label: string; standaard: 'ja' | 'nee' | null; test: (d: Dossier) => boolean }[] = [
  { key: 'bezoeker', label: 'Bezoeker toegewezen', standaard: null, test: (d) => d.bezoeker_id !== null },
  { key: 'bezoek', label: 'Bezoek gedaan', standaard: null, test: (d) => d.bezoek_afgerond_at !== null },
  { key: 'verstuurd', label: 'Plan verstuurd', standaard: null, test: (d) => stap('versturen').gedaan(d) !== null },
  { key: 'akkoord', label: 'Akkoord', standaard: null, test: (d) => d.corporatie_akkoord_at !== null || d.klussendienst_gekozen_at !== null },
  { key: 'uitvoerder', label: 'Uitvoerder toegewezen', standaard: null, test: (d) => d.uitvoerder_id !== null },
  { key: 'opgeleverd', label: 'Werk opgeleverd', standaard: null, test: (d) => d.werk_opgeleverd_at !== null },
  { key: 'gesloten', label: 'Gesloten', standaard: 'nee', test: (d) => d.gesloten_at !== null },
  { key: 'uitgevoerd', label: 'Uitgevoerd', standaard: null, test: (d) => d.gesloten_reden === 'Uitgevoerd' },
];

export function afspraakDatum(d: Dossier): Date | null {
  return d.afspraak ? lokaal(d.afspraak) : null;
}

export function corporatieNaam(d: Dossier): string | null {
  if (d.huur_koop !== 'huur') return null;
  const e = str(d, 'woningeigenaar');
  if (e === 'anders') return str(d, 'woningeigenaar_anders');
  return e;
}

export function corporatieEmail(d: Dossier): string {
  const e = str(d, 'woningeigenaar');
  return e && e in CORPORATIE_EMAIL ? CORPORATIE_EMAIL[e] : '';
}

export function adresRegel(d: Dossier): string {
  return d.adres ? adresTekst(d.adres) : `Dossier ${d.id} (nog geen adres)`;
}

export function adresTekst(a: Adres): string {
  return `${straatNummer(a)}, ${a.plaats}`;
}

export function straatNummer(a: Adres): string {
  return `${a.straat} ${a.huisnummer}${a.huisletter}${a.toevoeging ? `-${a.toevoeging}` : ''}`;
}

// Whose turn it is from a klusser's point of view, for the Mijn dossiers list.
export function opdracht(d: Dossier, userId: number): { rol: 'Bezoek' | 'Uitvoering'; aanZet: boolean; klaar: boolean } | null {
  const s = huidigeStap(d);
  const open = !d.gesloten_at;
  if (d.uitvoerder_id === userId && (s.nr >= 9 || d.bezoeker_id !== userId)) {
    return { rol: 'Uitvoering', aanZet: open && s.nr === 10, klaar: d.werk_opgeleverd_at !== null };
  }
  if (d.bezoeker_id === userId) {
    return { rol: 'Bezoek', aanZet: open && s.nr >= 3 && s.nr <= 5, klaar: d.klaar_voor_controle_at !== null };
  }
  return null;
}
