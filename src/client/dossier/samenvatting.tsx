// Read-only summaries of the sub-pages on the details page: every field, compact and text-only.
import { For, Show } from 'solid-js';
import { datum, euro } from '../../shared/datum.ts';
import { type Regenpijp, bronnenTekst, getal, kaartItems, verdelingTekst, waterberging } from '../../shared/kaart.ts';
import { SUBSIDIE_SJABLONEN, adresRegel, laatsteVerzending, str } from '../../shared/status.ts';
import type { Dossier } from '../../shared/types.ts';
import { materiaalRijen, materiaalTotaal, nietOpRiool, opsommingRegels, veldTekst, veldVoor, veldZichtbaar } from '../../shared/velden.ts';
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

function fotoSlotVan(key: string): string | null {
  const g = veldVoor(key)!;
  return g.veld.fotos === undefined ? null : g.veld.fotos.replace('*', g.id ?? '');
}

// One field as text plus the photos stored next to it, without a row of its own.
function VeldWaarde(props: { k: string }) {
  const s = useDossier();
  return (
    <>
      <Show when={veldVoor(props.k)!.veld.opsomming} fallback={<span class={veldVoor(props.k)!.veld.type === 'textarea' ? 'pre-wrap' : ''}>{veldTekst(s.d, props.k) ?? ''}</span>}>
        <ul class="mb-0 ps-3">
          <For each={opsommingRegels(veldTekst(s.d, props.k) ?? '')}>{(r) => <li>{r}</li>}</For>
        </ul>
      </Show>
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
    <Show when={veldZichtbaar(s.d, props.k)}>
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

export function InschrijvingSamenvatting() {
  const s = useDossier();
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
        {['huur_koop', 'woningeigenaar', 'woningtype'].filter((k) => veldZichtbaar(s.d, k)).map((k) => veldTekst(s.d, k)).filter(Boolean).join(', ')}
      </Regel>
      <VeldRegel k="rioolstelsel" />
      <Regel label="Subsidiemail">
        <Show when={laatsteVerzending(s.d, SUBSIDIE_SJABLONEN)} fallback={<span class="text-warning qa-subsidie-niet-verstuurd">Nog niet verstuurd</span>}>
          {(v) => <span class="text-groen fst-italic qa-subsidie-verstuurd">✅ {v().handmatig ? 'Handmatig verstuurd' : 'Verstuurd'} op {datum(v().created_at)} ({SUBSIDIE_VARIANT[v().sjabloon]})</span>}
        </Show>
      </Regel>
      <Show when={!gescheiden()} fallback={<div class="text-muted qa-sv-niet-subsidiabel">Straatfoto, kaart, boorprofiel en bodemsituatie zijn niet nodig: het riool is gescheiden.</div>}>
        {/* Large reference photos: a row of their own, spanning the label and value columns. */}
        <div class="row g-3 mb-2 qa-sv-fotos">
          <For each={[['kaart', 'Kaart'], ['straatfoto', 'Straatfoto'], ['boorprofiel', 'Boorprofiel']]}>
            {([slot, label]) => (
              <div class={`col-12 col-md-4 qa-sv-${slot}`}>
                <div class="text-muted mb-1">{label}</div>
                <Show when={aantalFotos(s.d, slot)} fallback={<span class="text-muted">--</span>}>
                  <FotoDuimen slot={slot} vierkant />
                </Show>
              </div>
            )}
          </For>
        </div>
        <VeldRegel k="boorlocatie" />
        <VeldRegel k="bodemsituatie" />
      </Show>
    </>
  );
}

function RegenpijpRegel(props: { pijp: Regenpijp }) {
  const s = useDossier();
  const k = (veld: string) => `regenpijp.${props.pijp.id}.${veld}`;
  const items = () => kaartItems(s.d);
  const kort = () => {
    const afkoppelen = veldTekst(s.d, k('afkoppelen')) && `Afkoppelen: ${veldTekst(s.d, k('afkoppelen'))}`;
    if (!nietOpRiool(s.d, props.pijp.id)) return afkoppelen;
    const w = waterberging(props.pijp, items().daken, s.d.normafvoer.mm);
    const delen = [
      afkoppelen,
      props.pijp.bronnen.length ? `van ${bronnenTekst(props.pijp, items().labels)}` : 'aan geen dak gekoppeld',
      w && `${w.liter} liter waterberging`,
      veldTekst(s.d, k('soort')),
      veldTekst(s.d, k('diameter')),
      veldTekst(s.d, k('regenton')) && `Regenton: ${veldTekst(s.d, k('regenton'))}`,
    ];
    return delen.filter(Boolean).join(' · ');
  };
  const sub: [string, string][] = [['ondergrond', 'Ondergrond'], ['waar', 'Water naar'], ['hoe', 'Via']];
  return (
    <Regel label={`Regenpijp ${props.pijp.label}`} class="qa-sv-regenpijp">
      <div>{kort() || <span class="text-muted">--</span>}</div>
      <For each={sub.filter(([v]) => veldZichtbaar(s.d, k(v)) && heeftWaarde(s.d, k(v)))}>
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
                dak.verdeling.length ? `regenpijp ${verdelingTekst(dak, items().labels)}` : 'geen regenpijp',
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
      <For each={items().stenen}>
        {(steen) => (
          <Regel label={`Steen ${steen.label}`} class="qa-sv-steen">
            {steen.m2 === null ? <span class="text-muted">-- m²</span> : `${getal(steen.m2)} m²`}
            <FotoDuimen slot={`steen.${steen.id}`} />
          </Regel>
        )}
      </For>
      <VeldRegel k="tuinsituatie" label="Tuinsituatie" />
      <For each={items().regenpijpen}>{(r) => <RegenpijpRegel pijp={r} />}</For>
      <VeldRegel k="hoosbuien" label="Bij hoosbuien" />
      <VeldRegel k="wensen" label="Wensen bewoner" />
      <FotoRegel slot="andere_fotos" label="Andere foto’s" />
      <VeldRegel k="bewoner_doet" label="Bewoner doet" />
      <VeldRegel k="ulebelt_doet" label="De Ulebelt doet" />
    </>
  );
}

export function PlanSamenvatting() {
  return (
    <>
      <VeldRegel k="beoordeling" />
      <VeldRegel k="beoordeling_toelichting" label="Toelichting" />
      <VeldRegel k="voorstel" label="Voorstel" />
      <MateriaalRegel lijst="materialen" label="Materialen" soort="geschat" />
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
