// Audit rows as readable lines, for a dossier's "Alle activiteit" and the app-wide one.
import { A } from '@solidjs/router';
import { For, type JSX, Show, createSignal } from 'solid-js';
import { datumTijd, euro } from '../shared/datum.ts';
import { SJABLONEN } from '../shared/sjablonen.ts';
import type { Json } from '../shared/types.ts';
import { fotoSlotVoor, veldVoor } from '../shared/velden.ts';

export interface AuditItem {
  id: number;
  created_at: string;
  updated_at: string;
  actor_id: number | null;
  impersonated_user_id: number | null;
  dossier_id: number | null;
  type: string;
  payload: Record<string, Json>;
}

const MIJLPAAL_LABEL: Record<string, string> = {
  intake_afgerond: 'Intake is compleet',
  bezoek_afgerond: 'Bezoek afgerond',
  klaar_voor_controle: 'Klaar voor controle',
  corporatie_akkoord: 'Woningcorporatie heeft het plan goedgekeurd',
  klussendienst_gekozen: 'Bewoner kiest voor de Klussendienst',
  werk_opgeleverd: 'Werk opgeleverd',
};

export const TYPE_LABEL: Record<string, string> = {
  dossier_aangemaakt: 'Dossier aangemaakt',
  dossier_gewijzigd: 'Dossier gewijzigd',
  dossier_verwijderd: 'Dossier verwijderd',
  mijlpaal: 'Stap geregistreerd',
  toegewezen: 'Toegewezen',
  gesloten: 'Dossier gesloten',
  heropend: 'Dossier heropend',
  uitgesteld: 'Aandacht uitgesteld',
  opnieuw_versturen_niet_nodig: 'Opnieuw versturen niet nodig',
  email_verstuurd: 'E-mail verstuurd',
  email_mislukt: 'E-mail niet afgeleverd',
  handmatig_verstuurd: 'Handmatig verstuurd',
  melding_verstuurd: 'Melding verstuurd',
  gebruiker_aangemaakt: 'Gebruiker aangemaakt',
  gebruiker_gewijzigd: 'Gebruiker gewijzigd',
  gebruiker_gearchiveerd: 'Gebruiker gearchiveerd',
  gebruiker_gedearchiveerd: 'Gebruiker teruggezet',
  inloggen_als_start: 'Bekijken als gestart',
  inloggen_als_stop: 'Bekijken als gestopt',
  login_geblokkeerd: 'Inloggen geblokkeerd',
  materiaal_toegevoegd: 'Materiaal toegevoegd',
  materiaal_gewijzigd: 'Materiaal gewijzigd',
  materiaal_verwijderd: 'Materiaal verwijderd',
  materialen_volgorde: 'Volgorde materialen gewijzigd',
  sjabloon_gewijzigd: 'E-mailsjabloon gewijzigd',
  feedback: 'Feedback gegeven',
};

const ITEM_LABEL: Record<string, string> = { dak: 'Dak', tuin: 'Tuin', regenpijp: 'Regenpijp', materiaal: 'Materiaal', gebruikt: 'Gebruikt materiaal', voorstel: 'Werkzaamheid' };

const s = (v: Json) => (typeof v === 'string' ? v : JSON.stringify(v));

// Old audit rows can name fields that no longer exist, so unknown keys fall back to the raw key.
function veldLabel(key: string): string {
  if (key === 'adres') return 'Adres';
  if (key.startsWith('fotos.')) {
    const f = fotoSlotVoor(key.slice('fotos.'.length));
    return f ? `Foto’s: ${f.slot.label}` : key;
  }
  if (key.startsWith('annotaties.')) return 'Tekeningen op een foto';
  const def = veldVoor(key);
  if (!def) return key;
  const item = def.id !== null && def.veld.key.includes('.*.') ? `${ITEM_LABEL[key.split('.')[0]]}: ` : '';
  return `${item}${def.veld.label}${def.anders ? ' (anders, namelijk)' : ''}`;
}

function waardeTekst(key: string, v: Json): string {
  if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return '(leeg)';
  if (key.startsWith('fotos.') && Array.isArray(v)) return `${v.length} foto${v.length === 1 ? '' : '’s'}`;
  if ((key.startsWith('annotaties.') || key === 'kaart_annotaties') && Array.isArray(v)) return `${v.length} tekening${v.length === 1 ? '' : 'en'}`;
  if (key.endsWith('.prijs') && typeof v === 'number') return euro(v);
  const def = veldVoor(key);
  const opties = def && !def.anders ? def.veld.opties : undefined;
  const optie = (w: Json) => {
    const o = opties ? opties.find(([k]) => k === w) : undefined;
    return o ? o[1] : s(w);
  };
  if (Array.isArray(v)) return def && def.veld.type === 'ids' ? `${v.length} regel${v.length === 1 ? '' : 's'}` : v.map(optie).join(', ');
  return optie(v);
}

function Wijzigingen(props: { changes: Record<string, [Json, Json]> }) {
  return (
    <ul class="mb-0 ps-3 small qa-wijzigingen-lijst">
      <For each={Object.entries(props.changes)}>
        {([key, [oud, nieuw]]) => (
          <li>
            <span class="fw-semibold">{veldLabel(key)}</span>: <span class="text-muted text-decoration-line-through pre-wrap">{waardeTekst(key, oud)}</span> → <span class="pre-wrap">{waardeTekst(key, nieuw)}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

function Inklapbaar(props: { label: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button type="button" class="btn btn-link btn-sm p-0 align-baseline qa-details" onClick={() => setOpen(!open())}>{open() ? 'Verbergen' : props.label}</button>
      <Show when={open()}>{props.children}</Show>
    </>
  );
}

// A plain function, not a component: <For> renders each row once per item, so nothing here needs to react.
function samenvatting(item: AuditItem): JSX.Element {
  const p = () => item.payload;
  const sjabloonNaam = (key: Json) => {
    const def = SJABLONEN.find((x) => x.key === key);
    return def ? def.naam : s(key);
  };
  const mail = () => (
    <>
      {sjabloonNaam(p().sjabloon)} aan {s(p().aan)}: “{s(p().onderwerp)}”{' '}
      <Inklapbaar label="Tekst tonen">
        <div class="small border rounded p-2 mt-1 pre-wrap bg-body-tertiary">{s(p().tekst)}</div>
      </Inklapbaar>
    </>
  );
  const t = item.type;
  if (t === 'dossier_gewijzigd') return <Wijzigingen changes={p().changes as Record<string, [Json, Json]>} />;
  if (t === 'mijlpaal') return <>{MIJLPAAL_LABEL[s(p().mijlpaal)]}{p().aan === false ? ' (teruggedraaid)' : ''}</>;
  if (t === 'toegewezen') return <>{p().rol === 'bezoeker' ? 'Bezoeker' : 'Uitvoerder'}: {p().van === null ? 'niemand' : s(p().van)} → {p().naar === null ? 'niemand' : s(p().naar)}</>;
  if (t === 'gesloten') return <>Reden: {s(p().reden)}{p().toelichting ? `. ${s(p().toelichting)}` : ''}</>;
  if (t === 'heropend') return <>Was gesloten: {s(p().reden)}</>;
  if (t === 'uitgesteld') return <>Tot {s(p().tot)}: {s(p().notitie)}</>;
  if (t === 'opnieuw_versturen_niet_nodig') return <>Voor {s(p().ontvanger)}: {s(p().notitie)}</>;
  if (t === 'email_verstuurd' || t === 'email_mislukt' || t === 'handmatig_verstuurd') return mail();
  if (t === 'melding_verstuurd') return <>Aan {s(p().aan)}: “{s(p().onderwerp)}”</>;
  if (t === 'dossier_verwijderd') return <>Dossier {s(p().dossier_id)}: {s(p().adres)}</>;
  if (t === 'gebruiker_aangemaakt' || t === 'gebruiker_gearchiveerd' || t === 'gebruiker_gedearchiveerd' || t === 'inloggen_als_start' || t === 'inloggen_als_stop') {
    return <A href={`/gebruikers/${s(p().gebruiker_id)}`}>{s(p().naam)}</A>;
  }
  if (t === 'gebruiker_gewijzigd') {
    return (
      <>
        <A href={`/gebruikers/${s(p().gebruiker_id)}`}>{s(p().naam)}</A>
        <Wijzigingen changes={p().changes as Record<string, [Json, Json]>} />
      </>
    );
  }
  if (t === 'login_geblokkeerd') return <>{s(p().email)} vanaf {s(p().ip)} ({s(p().limiet)})</>;
  if (t === 'materiaal_toegevoegd' || t === 'materiaal_verwijderd') return <>{s(p().naam)}, {euro(p().prijs as number)}</>;
  if (t === 'materiaal_gewijzigd') {
    const oud = p().oud as { naam: string; prijs: number };
    const nieuw = p().nieuw as { naam: string; prijs: number };
    return <>{oud.naam}, {euro(oud.prijs)} → {nieuw.naam}, {euro(nieuw.prijs)}</>;
  }
  if (t === 'sjabloon_gewijzigd') return <>{sjabloonNaam(p().sjabloon)}</>;
  if (t === 'feedback') return <A href="/beheer/feedback">Op {s(p().scherm)}</A>;
  return null;
}

export function wie(i: AuditItem, naam: (id: number) => string): string {
  if (i.actor_id === null) return 'Systeem';
  return i.impersonated_user_id === null ? naam(i.actor_id) : `${naam(i.actor_id)} (als ${naam(i.impersonated_user_id)})`;
}

export function ActiviteitLijst(props: { items: AuditItem[]; naam: (id: number) => string; adres?: (item: AuditItem) => JSX.Element }) {
  return (
    <div class="table-responsive">
      <table class="table table-sm align-top qa-activiteit-lijst">
        <thead>
          <tr>
            <th style={{ width: '9.5rem' }}>Wanneer</th>
            <th style={{ width: '10rem' }}>Wie</th>
            <Show when={props.adres}>
              <th>Dossier</th>
            </Show>
            <th>Wat</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.items}>
            {(i) => (
              <tr class={`qa-activiteit qa-type-${i.type}`}>
                <td class="text-nowrap small">
                  {datumTijd(i.created_at)}
                  <Show when={i.updated_at !== i.created_at}>
                    <div class="text-muted">t/m {datumTijd(i.updated_at)}</div>
                  </Show>
                </td>
                <td class="small">{wie(i, props.naam)}</td>
                <Show when={props.adres}>{(adres) => <td class="small">{adres()(i)}</td>}</Show>
                <td>
                  <div class={`fw-semibold small ${i.type === 'email_mislukt' || i.type === 'login_geblokkeerd' ? 'text-danger' : ''}`}>{TYPE_LABEL[i.type] ?? i.type}</div>
                  <div class="small">
                    {samenvatting(i)}
                  </div>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
