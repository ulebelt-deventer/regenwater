// Read-only summaries of the sub-pages on the details page: every field, compact and text-only.
import { For, Show } from 'solid-js';
import { datum, euro } from '../../shared/datum.ts';
import { getal, kaartFoto, kaartItems, waterberging } from '../../shared/kaart.ts';
import { SUBSIDIE_SJABLONEN, adresRegel, laatsteVerzending, str } from '../../shared/status.ts';
import type { Dossier } from '../../shared/types.ts';
import { lijst, materiaalRijen, materiaalTotaal, veldTekst, veldVoor } from '../../shared/velden.ts';
import { FotoDuimen } from './fotos.tsx';
import { useDossier } from './staat.ts';
import { Regel } from './velden.tsx';

const SUBSIDIE_VARIANT: Record<string, string> = {
  subsidie_huur: 'subsidiabel, huurwoning',
  subsidie_koop: 'subsidiabel, koopwoning',
  subsidie_niet: 'niet subsidiabel',
};

function aantalFotos(d: Dossier, slot: string): number {
  return d.fotos.filter((f) => f.slot === slot).length;
}

// The part of a field the edit page shows: hidden fields (eg Woningeigenaar for a koopwoning) are left out here too.
function zichtbaar(d: Dossier, key: string): boolean {
  const g = veldVoor(key);
  if (!g) throw new Error(`Onbekend veld: ${key}`);
  return !g.veld.zichtbaar || g.veld.zichtbaar(d, g.id);
}

function fotoSlotVan(key: string): string | null {
  const g = veldVoor(key)!;
  return g.veld.fotos === undefined ? null : g.veld.fotos.replace('*', g.id ?? '');
}

// One field as text plus the photos stored next to it, without a row of its own.
function VeldWaarde(props: { k: string }) {
  const s = useDossier();
  return (
    <>
      <span class={veldVoor(props.k)!.veld.type === 'textarea' ? 'pre-wrap' : ''}>{veldTekst(s.d, props.k) ?? ''}</span>
      <Show when={fotoSlotVan(props.k)}>{(sl) => <FotoDuimen slot={sl()} />}</Show>
    </>
  );
}

function heeftWaarde(d: Dossier, key: string): boolean {
  const slot = fotoSlotVan(key);
  return veldTekst(d, key) !== null || (slot !== null && aantalFotos(d, slot) > 0);
}

function VeldRegel(props: { k: string; label?: string }) {
  const s = useDossier();
  return (
    <Show when={zichtbaar(s.d, props.k)}>
      <Regel label={props.label ?? veldVoor(props.k)!.veld.label} leeg={!heeftWaarde(s.d, props.k)} class={`qa-sv-${props.k.replace(/\./g, '-')}`}>
        <VeldWaarde k={props.k} />
      </Regel>
    </Show>
  );
}

function FotoRegel(props: { slot: string; label: string }) {
  const s = useDossier();
  return <Regel label={props.label} leeg={!aantalFotos(s.d, props.slot)} class={`qa-sv-${props.slot}`}><FotoDuimen slot={props.slot} /></Regel>;
}

function MateriaalRegel(props: { lijst: 'materialen' | 'gebruikt'; label: string; soort: string }) {
  const s = useDossier();
  // As in the plan PDF, only rows with an Aantal count: the rest of the catalog the sub-page offers stays out.
  const rijen = () => materiaalRijen(s.d, props.lijst).filter((r) => r.aantal !== null && r.aantal > 0);
  return (
    <Regel label={props.label} leeg={!rijen().length} class={`qa-sv-${props.lijst}`}>
      <For each={rijen()}>
        {(r) => <div>{getal(r.aantal!)} × {r.naam.trim() || <span class="text-muted">naamloos</span>}{r.prijs === null ? '' : ` à ${euro(r.prijs)}`}</div>}
      </For>
      <div class="text-muted">Totaal {euro(materiaalTotaal(rijen()))} ({props.soort})</div>
    </Regel>
  );
}

export function IntakeSamenvatting() {
  const s = useDossier();
  const kaart = () => kaartFoto(s.d);
  const gescheiden = () => str(s.d, 'rioolstelsel') === 'gescheiden';
  return (
    <>
      <Regel label="Adres" leeg={!s.d.adres}>
        {s.d.adres ? `${adresRegel(s.d)} (${s.d.adres.postcode}, gemeente ${s.d.adres.gemeente})` : ''}
      </Regel>
      <Regel label="Bewoner" leeg={!str(s.d, 'bewoner_naam') && !str(s.d, 'bewoner_telefoon') && !str(s.d, 'bewoner_email')} class="qa-sv-bewoner">
        <Show when={str(s.d, 'bewoner_naam')}>{(n) => <span class="me-2 text-nowrap">{n()}</span>}</Show>
        <Show when={str(s.d, 'bewoner_telefoon')}>{(t) => <span class="me-2 text-nowrap">{str(s.d, 'bewoner_naam') ? '• ' : ''}<a href={`tel:${t()}`} class="qa-tel">{t()}</a></span>}</Show>
        <Show when={str(s.d, 'bewoner_email')}>{(e) => <span class="text-nowrap">{str(s.d, 'bewoner_naam') || str(s.d, 'bewoner_telefoon') ? '• ' : ''}<a href={`mailto:${e()}`} class="qa-mailto">{e()}</a></span>}</Show>
      </Regel>
      <Regel label="Woning" leeg={!s.d.huur_koop}>
        {['huur_koop', 'woningeigenaar', 'woningtype'].filter((k) => zichtbaar(s.d, k)).map((k) => veldTekst(s.d, k)).filter(Boolean).join(', ')}
      </Regel>
      <VeldRegel k="rioolstelsel" />
      <Regel label="Subsidiemail">
        <Show when={laatsteVerzending(s.d, SUBSIDIE_SJABLONEN)} fallback={<span class="text-warning qa-subsidie-niet-verstuurd">Nog niet verstuurd</span>}>
          {(v) => <span class="text-groen fst-italic qa-subsidie-verstuurd">✅ {v().handmatig ? 'Handmatig verstuurd' : 'Verstuurd'} op {datum(v().created_at)} ({SUBSIDIE_VARIANT[v().sjabloon]})</span>}
        </Show>
      </Regel>
      <Show when={!gescheiden()} fallback={<div class="text-muted qa-sv-niet-subsidiabel">Straatfoto, kaart, boorprofiel en bodemsituatie zijn niet nodig: het riool is gescheiden.</div>}>
        <FotoRegel slot="straatfoto" label="Straatfoto" />
        <Regel label="Kaart" leeg={!kaart()} class="qa-sv-kaart">
          {kaart() !== null && kaart()!.m_per_px !== null ? 'Luchtfoto, op schaal' : 'Screenshot, niet op schaal'}
          <FotoDuimen slot="kaart" />
        </Regel>
        <FotoRegel slot="boorprofiel" label="Boorprofiel" />
        <VeldRegel k="boorlocatie" />
        <VeldRegel k="bodemsituatie" />
      </Show>
    </>
  );
}

function RegenpijpRegel(props: { id: string; label: string; dak: string | null }) {
  const s = useDossier();
  const k = (veld: string) => `regenpijp.${props.id}.${veld}`;
  const items = () => kaartItems(s.d);
  const kort = () => {
    const delen = [
      props.dak ? `van ${items().labels.get(props.dak)}` : null,
      veldTekst(s.d, k('soort')),
      veldTekst(s.d, k('diameter')),
      veldTekst(s.d, k('regenton')) && `Regenton: ${veldTekst(s.d, k('regenton'))}`,
      veldTekst(s.d, k('afkoppelen')) && `Afkoppelen: ${veldTekst(s.d, k('afkoppelen'))}`,
    ];
    return delen.filter(Boolean).join(' · ');
  };
  const sub: [string, string][] = [['ondergrond', 'Ondergrond'], ['waar', 'Water naar'], ['hoe', 'Via']];
  return (
    <Regel label={`Regenpijp ${props.label}`} class="qa-sv-regenpijp">
      <div>{kort() || <span class="text-muted">--</span>}</div>
      <For each={sub.filter(([v]) => zichtbaar(s.d, k(v)) && heeftWaarde(s.d, k(v)))}>
        {([v, label]) => <div><span class="text-muted">{label}:</span> <VeldWaarde k={k(v)} /></div>}
      </For>
    </Regel>
  );
}

export function BezoekSamenvatting() {
  const s = useDossier();
  const items = () => kaartItems(s.d);
  return (
    <>
      <Show when={items().daken.length} fallback={<Regel label="Daken" leeg>{''}</Regel>}>
        <For each={items().daken}>
          {(dak) => (
            <Regel label={`Dak ${dak.label}`} class="qa-sv-dak">
              {[
                dak.m2 === null ? null : `${getal(dak.m2)} m²`,
                dak.regenpijpen.length ? `regenpijp ${dak.regenpijpen.map((id) => items().labels.get(id)).join(', ')}` : 'geen regenpijp',
                waterberging(dak) && `${waterberging(dak)!.liter} liter waterberging per regenpijp`,
              ].filter(Boolean).join(' · ')}
            </Regel>
          )}
        </For>
      </Show>
      <Show when={items().tuinen.length} fallback={<Regel label="Tuinen" leeg>{''}</Regel>}>
        <For each={items().tuinen}>
          {(tuin) => (
            <Regel label={`Tuin ${tuin.label}`} class="qa-sv-tuin">
              {tuin.m2 === null ? <span class="text-muted">-- m²</span> : `${getal(tuin.m2)} m²`}
              <FotoDuimen slot={`tuin.${tuin.id}`} />
            </Regel>
          )}
        </For>
      </Show>
      <VeldRegel k="verhard" label="Verhard" />
      <VeldRegel k="tuinsituatie" label="Tuinsituatie" />
      <For each={items().regenpijpen}>{(r) => <RegenpijpRegel id={r.id} label={r.label} dak={r.dak} />}</For>
      <VeldRegel k="hoosbuien" label="Bij hoosbuien" />
      <VeldRegel k="wensen" label="Wensen bewoner" />
    </>
  );
}

export function PlanSamenvatting() {
  const s = useDossier();
  const voorstel = () => lijst(s.d, 'voorstel').map((id) => str(s.d, `voorstel.${id}.tekst`)).filter((t) => t !== null);
  return (
    <>
      <VeldRegel k="beoordeling" />
      <VeldRegel k="beoordeling_toelichting" label="Toelichting" />
      <Regel label="Voorstel" leeg={!voorstel().length} class="qa-sv-voorstel">
        <ul class="mb-0 ps-3">
          <For each={voorstel()}>{(t) => <li>{t}</li>}</For>
        </ul>
      </Regel>
      <VeldRegel k="bewoner_doet" label="Bewoner doet" />
      <VeldRegel k="bewoner_doet_details" label="Details bewoner" />
      <VeldRegel k="ulebelt_doet" label="De Ulebelt doet" />
      <VeldRegel k="ulebelt_doet_details" label="Details De Ulebelt" />
      <MateriaalRegel lijst="materialen" label="Materialen" soort="geschat" />
      <VeldRegel k="werkzaamheden" />
    </>
  );
}

export function UitvoeringSamenvatting() {
  return (
    <>
      <VeldRegel k="uitgevoerd" label="Uitgevoerd" />
      <FotoRegel slot="opleverfotos" label="Opleverfoto’s" />
      <MateriaalRegel lijst="gebruikt" label="Gebruikte materialen" soort="gebruikt" />
    </>
  );
}
