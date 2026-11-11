import { For, type JSX, Show } from 'solid-js';
import { BTW_PROCENT, DOORLAATBAARHEID, KLUSSENDIENST_PER_REGENPIJP_CENT } from '../../shared/constants.ts';
import { euro, kortDatum } from '../../shared/datum.ts';
import { AUTO_VERDELING_UITLEG, type Vlak, autoGesplitst, bronnenTekst, getal, kaartAnnotaties, kaartFoto, kaartItems, normafvoerTekst, verdelingTekst, waterberging } from '../../shared/kaart.ts';
import { btwOver, klussendienstKosten } from '../../shared/specificatie.ts';
import { eigenaar, str } from '../../shared/status.ts';
import type { Dossier } from '../../shared/types.ts';
import { BEOORDELINGEN, materiaalRijen, materiaalTotaal, opsommingRegels, optieLabel, veld, veldZichtbaar } from '../../shared/velden.ts';
import { Alinea, type Doc, Fotos, FotoMetTekening, Keuze, Kop, Leeg, OnderdeelIcoon, Of, fotosIn, heeft, naamVan } from './onderdelen.tsx';

const getoondeMaterialen = (d: Dossier, lijst: 'materialen' | 'gebruikt') => materiaalRijen(d, lijst).filter((r) => r.naam.trim() && r.aantal !== null && r.aantal > 0);

function Materialen(props: { doc: Doc; lijst: 'materialen' | 'gebruikt' }): JSX.Element {
  const rijen = () => getoondeMaterialen(props.doc.d, props.lijst);
  return (
    <Show when={rijen().length > 0} fallback={<Show when={props.doc.concept}><p><Leeg doc={props.doc} /></p></Show>}>
      <table class="tabel">
        <thead>
          <tr>
            <th>Materiaal</th>
            <th class="getal">Aantal</th>
          </tr>
        </thead>
        <tbody>
          <For each={rijen()}>
            {(r) => (
              <tr>
                <td>{r.naam}</td>
                <td class="getal">{getal(r.aantal!)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

// Only for a koopwoning: a huurwoning's plan carries no prices. The bewoner chooses between doing the work themselves
// and the Klussendienst, so each gets its own column; without a regenpijp to afkoppelen there is no Klussendienst column.
function Kosteninschatting(props: { doc: Doc }): JSX.Element {
  const rijen = () => getoondeMaterialen(props.doc.d, 'materialen');
  const zonderPrijs = () => rijen().filter((r) => r.prijs === null).map((r) => r.naam.trim());
  const materiaal = () => materiaalTotaal(rijen());
  const klussendienst = () => klussendienstKosten(props.doc.d);
  const kolommen = () => {
    const zelf = { kop: 'Zelf uitvoeren', klussendienst: null, excl: materiaal() };
    const metKlussendienst = { kop: 'Met de Klussendienst', klussendienst: klussendienst().bedrag, excl: materiaal() + klussendienst().bedrag };
    return klussendienst().pijpen > 0 ? [zelf, metKlussendienst] : [zelf];
  };
  return (
    <Show when={props.doc.d.huur_koop === 'koop' && (rijen().length > 0 || klussendienst().pijpen > 0)}>
      <div class="qa-pdf-kosteninschatting">
        <h3>Kosteninschatting</h3>
        <table class="tabel">
          <thead>
            <tr>
              <th />
              <For each={kolommen()}>{(k) => <th class="getal">{k.kop}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Materiaal</td>
              <For each={kolommen()}>{() => <td class="getal">{euro(materiaal())}</td>}</For>
            </tr>
            <Show when={klussendienst().pijpen > 0}>
              <tr class="qa-pdf-klussendienst">
                <td>{`Klussendienst: ${klussendienst().pijpen} ${klussendienst().pijpen === 1 ? 'regenpijp' : 'regenpijpen'} afkoppelen × ${euro(KLUSSENDIENST_PER_REGENPIJP_CENT)}`}</td>
                <For each={kolommen()}>{(k) => <td class="getal">{k.klussendienst === null ? '--' : euro(k.klussendienst)}</td>}</For>
              </tr>
            </Show>
            <tr>
              <td>Totaal excl. btw</td>
              <For each={kolommen()}>{(k) => <td class="getal">{euro(k.excl)}</td>}</For>
            </tr>
            <tr>
              <td>{`btw ${BTW_PROCENT}%`}</td>
              <For each={kolommen()}>{(k) => <td class="getal">{euro(btwOver(k.excl))}</td>}</For>
            </tr>
            <tr>
              <th>Totaal incl. btw</th>
              <For each={kolommen()}>{(k) => <th class="getal qa-pdf-totaal-incl">{euro(k.excl + btwOver(k.excl))}</th>}</For>
            </tr>
          </tbody>
        </table>
        <Show when={zonderPrijs().length > 0}>
          <p class="qa-pdf-zonder-prijs">{`Nog zonder prijs, dus niet meegeteld: ${zonderPrijs().join(', ')}.`}</p>
        </Show>
        <p class="klein qa-pdf-geen-garantie">Dit is een prijsinschatting en geen garantie voor de uiteindelijke kosten. De werkelijke kosten kunnen hoger of lager uitvallen.</p>
      </div>
    </Show>
  );
}

function Regenwatervolume(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const items = () => kaartItems(d());
  const kaart = () => kaartFoto(d());
  const huurKoop = () => {
    const hk = optieLabel(veld('huur_koop'), d(), 'huur_koop');
    const e = eigenaar(d());
    return hk && d().huur_koop === 'huur' && e ? `${hk}, ${e}` : hk;
  };
  return (
    <>
      <h2>1. Regenwatervolume</h2>
      <h3>Algemeen</h3>
      <table class="kop-tabel">
        <tbody>
          <tr>
            <td>Woningtype:</td>
            <td><Keuze doc={props.doc} key="woningtype" /></td>
          </tr>
          <tr>
            <td>Huur/koop:</td>
            <td><Of doc={props.doc} v={huurKoop()} /></td>
          </tr>
        </tbody>
      </table>
      <div class="fotos">
        <For each={fotosIn(d(), 'straatfoto')}>
          {(f) => (
            <figure class="qa-pdf-straatfoto">
              <FotoMetTekening doc={props.doc} foto={f} />
              <figcaption>Vooraanzicht</figcaption>
            </figure>
          )}
        </For>
        <Show when={kaart()}>
          {(k) => (
            <figure class="qa-pdf-kaart">
              <FotoMetTekening doc={props.doc} foto={k()} annots={kaartAnnotaties(d())} mPerPx={k().m_per_px} />
              <figcaption>Kadastrale kaart met dakdelen (D), tuindelen (T), stenen vlakken (S) en regenpijpen (A, B, ...)</figcaption>
            </figure>
          )}
        </Show>
      </div>
      <Show when={items().daken.length > 0 || props.doc.concept}>
        <h3>Dakoppervlakte en waterberging</h3>
      </Show>
      <Show when={!kaart() && props.doc.concept}>
        <p><Leeg doc={props.doc} /></p>
      </Show>
      <Show when={items().daken.length > 0}>
        <table class="tabel">
          <thead>
            <tr>
              <th>
                <OnderdeelIcoon soort="dak" />
                Dak
              </th>
              <th class="getal">Oppervlakte*</th>
              <th>Regenpijpen</th>
            </tr>
          </thead>
          <tbody>
            <For each={items().daken}>
              {(dak) => (
                <tr>
                  <td>{dak.label}</td>
                  <td class="getal">{dak.m2 === null ? <Leeg doc={props.doc} /> : `${getal(dak.m2)} m²`}</td>
                  <td>{dak.verdeling.length ? verdelingTekst(dak, items().labels) : '--'}{autoGesplitst(dak) && '†'}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={items().regenpijpen.length > 0}>
          <table class="tabel qa-pdf-waterberging">
            <thead>
              <tr>
                <th>
                  <OnderdeelIcoon soort="regenpijp" />
                  Regenpijp
                </th>
                <th>Voert af van</th>
                <th>Waterberging**</th>
              </tr>
            </thead>
            <tbody>
              <For each={items().regenpijpen}>
                {(r) => {
                  const wb = waterberging(r, items().daken, d().normafvoer.mm);
                  return (
                    <tr>
                      <td>{r.label}</td>
                      <td>{r.bronnen.length ? bronnenTekst(r, items().labels) : '--'}</td>
                      <td>{wb ? wb.uitleg : r.bronnen.length ? <Leeg doc={props.doc} /> : '-- (geen dak)'}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </Show>
        <p class="voetnoot">* bron: kadastrale kaart (PDOK)</p>
        <Show when={items().daken.some(autoGesplitst)}>
          <p class="voetnoot qa-pdf-voetnoot-verdeling">† automatisch verdeeld: {AUTO_VERDELING_UITLEG}</p>
        </Show>
        <p class="voetnoot qa-pdf-voetnoot-normafvoer">** {normafvoerTekst(d().normafvoer)}</p>
      </Show>
    </>
  );
}

function VlakTabel(props: { doc: Doc; soort: 'tuin' | 'steen'; titel: string; vlakken: Vlak[] }): JSX.Element {
  return (
    <Show when={props.vlakken.length > 0}>
      <table class="tabel">
        <thead>
          <tr>
            <th>
              <OnderdeelIcoon soort={props.soort} />
              {props.titel}
            </th>
            <th class="getal">Oppervlakte</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.vlakken}>
            {(t) => (
              <tr>
                <td>{t.label}</td>
                <td class="getal">{t.m2 === null ? <Leeg doc={props.doc} /> : `${getal(t.m2)} m²`}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

function Infiltratie(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const tuinen = () => kaartItems(d()).tuinen;
  const stenen = () => kaartItems(d()).stenen;
  return (
    <>
      <h2>2. Infiltratie</h2>
      <VlakTabel doc={props.doc} soort="tuin" titel="Tuin" vlakken={tuinen()} />
      <VlakTabel doc={props.doc} soort="steen" titel="Steen" vlakken={stenen()} />
      <h3>Tuinsituatie</h3>
      <Alinea doc={props.doc} key="tuinsituatie" />
      <Fotos doc={props.doc} slot="tuinsituatie" />
      <h3>Wat gebeurt er bij hoosbuien?</h3>
      <Alinea doc={props.doc} key="hoosbuien" />
      <Fotos doc={props.doc} slot="hoosbuien" />
      <For each={tuinen().filter((t) => fotosIn(d(), `tuin.${t.id}`).length > 0)}>
        {(t) => <Fotos doc={props.doc} slot={`tuin.${t.id}`} onderschrift={`Tuin ${t.label}`} />}
      </For>
      <For each={stenen().filter((t) => fotosIn(d(), `steen.${t.id}`).length > 0)}>
        {(t) => <Fotos doc={props.doc} slot={`steen.${t.id}`} onderschrift={`Steen ${t.label}`} />}
      </For>
    </>
  );
}

function Bodemgegevens(props: { doc: Doc }): JSX.Element {
  return (
    <>
      <h2>3. Bodemgegevens</h2>
      <table class="kop-tabel">
        <tbody>
          <tr>
            <td>Bodemsituatie:</td>
            <td><Keuze doc={props.doc} key="bodemsituatie" /></td>
          </tr>
          <tr>
            <td>Boorlocatie:</td>
            <td><Of doc={props.doc} v={str(props.doc.d, 'boorlocatie')} /></td>
          </tr>
          <tr>
            <td>Bron:</td>
            <td>BRO/DINOloket</td>
          </tr>
        </tbody>
      </table>
      <Show when={fotosIn(props.doc.d, 'boorprofiel').length > 0}>
        <p class="klein">Het boorprofiel staat in de bijlage.</p>
      </Show>
    </>
  );
}

function Opsomming(props: { doc: Doc; key: string }): JSX.Element {
  const regels = () => opsommingRegels(str(props.doc.d, props.key) ?? '');
  return (
    <Show when={regels().length > 0} fallback={<Show when={props.doc.concept}><p><Leeg doc={props.doc} /></p></Show>}>
      <ul>
        <For each={regels()}>{(r) => <li>{r}</li>}</For>
      </ul>
    </Show>
  );
}

function PlanVanAanpak(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const pijpen = () => kaartItems(d()).regenpijpen;
  const labels = () => kaartItems(d()).labels;
  const k = (id: string, veldNaam: string) => `regenpijp.${id}.${veldNaam}`;
  const kies = (id: string, veldNaam: string) => optieLabel(veld(`regenpijp.*.${veldNaam}`), d(), k(id, veldNaam));
  const getoond = (id: string, veldNaam: string) => veldZichtbaar(d(), k(id, veldNaam));
  const beoordeling = () => {
    const b = d().data.beoordeling;
    const r = BEOORDELINGEN.find(([key]) => key === b);
    return r ? r[2] : null;
  };
  return (
    <>
      <h2>4. Plan van aanpak</h2>
      <h3>Regenpijpen</h3>
      <Show when={pijpen().length > 0} fallback={<Show when={props.doc.concept}><p><Leeg doc={props.doc} /></p></Show>}>
        <table class="tabel">
          <thead>
            <tr>
              <th>Pijp</th>
              <th>Dak</th>
              <th>Soort</th>
              <th>Diameter</th>
              <th>Regenton</th>
              <th>Afkoppelen</th>
              <th>Waar & hoe gaat het water naartoe</th>
            </tr>
          </thead>
          <tbody>
            <For each={pijpen()}>
              {(r) => (
                <tr>
                  <td>{r.label}</td>
                  <td>{r.bronnen.length ? bronnenTekst(r, labels()) : '--'}</td>
                  <td><Of doc={props.doc} v={kies(r.id, 'soort')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'diameter')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'regenton')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'afkoppelen')} /></td>
                  <td>
                    <Show when={getoond(r.id, 'waar')} fallback="--">
                      <Of doc={props.doc} v={str(d(), k(r.id, 'waar'))} />
                      <Show when={kies(r.id, 'hoe')}>
                        <br />
                        <span class="klein">Via: {kies(r.id, 'hoe')}</span>
                      </Show>
                    </Show>
                    <Show when={getoond(r.id, 'ondergrond') && str(d(), k(r.id, 'ondergrond'))}>
                      <br />
                      <span class="klein">Ondergrond: {str(d(), k(r.id, 'ondergrond'))}</span>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <For each={pijpen()}>
          {(r) => (
            <For each={['ondergrond', 'waar', 'hoe'].filter((s) => getoond(r.id, s))}>
              {(s) => <Fotos doc={props.doc} slot={k(r.id, s)} onderschrift={`Regenpijp ${r.label}`} />}
            </For>
          )}
        </For>
      </Show>
      <h3>Wensen van de bewoner</h3>
      <Alinea doc={props.doc} key="wensen" />
      <Show when={fotosIn(d(), 'andere_fotos').length > 0}>
        <h3>Andere foto’s</h3>
        <Fotos doc={props.doc} slot="andere_fotos" />
      </Show>
      <h3>Voorstel Ulebelt</h3>
      <Show when={beoordeling() || props.doc.concept}>
        <p>
          <Of doc={props.doc} v={beoordeling()} />
        </p>
      </Show>
      <Show when={heeft(d(), 'beoordeling_toelichting')}>
        <p>{str(d(), 'beoordeling_toelichting')}</p>
      </Show>
      <Show when={opsommingRegels(str(d(), 'voorstel') ?? '').length > 0}>
        <p>De Ulebelt stelt de volgende werkzaamheden voor:</p>
      </Show>
      <Opsomming doc={props.doc} key="voorstel" />
      <h3>Afspraken</h3>
      <p>
        <strong>Wat gaat de bewoner doen?</strong>
      </p>
      <Opsomming doc={props.doc} key="bewoner_doet" />
      <p>
        <strong>Wat gaat De Ulebelt doen?</strong>
      </p>
      <Opsomming doc={props.doc} key="ulebelt_doet" />
    </>
  );
}

function Bijlage(props: { doc: Doc }): JSX.Element {
  return (
    <div class="nieuwe-pagina">
      <h2>Bijlage</h2>
      <div class="kolommen">
        <Show when={fotosIn(props.doc.d, 'boorprofiel').length > 0}>
          <div class="qa-pdf-boorprofiel">
            <h3>Boorprofiel</h3>
            <Fotos doc={props.doc} slot="boorprofiel" breed />
          </div>
        </Show>
        <div class="qa-pdf-doorlaatbaarheid">
          <h3>Doorlaatbaarheid per grondsoort</h3>
          <table class="tabel">
            <thead>
              <tr>
                <th>Grondsoort</th>
                <th>Doorlaatbaarheid</th>
              </tr>
            </thead>
            <tbody>
              <For each={DOORLAATBAARHEID}>
                {([, g, w]) => (
                  <tr>
                    <td>{g}</td>
                    <td>{w}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Plan(props: { doc: Doc }): JSX.Element {
  return (
    <>
      <Show when={props.doc.concept}>
        <div class="concept-banner geen-print">Concept: zo ziet het Plan van Aanpak er nu uit. Lege velden zijn gemarkeerd met "nog niet ingevuld"; in de PDF worden ze weggelaten.</div>
      </Show>
      <Kop doc={props.doc} titel="Plan van Aanpak regenwater" />
      <Regenwatervolume doc={props.doc} />
      <Infiltratie doc={props.doc} />
      <Bodemgegevens doc={props.doc} />
      <PlanVanAanpak doc={props.doc} />
      <h2>5. Materialenlijst</h2>
      <Materialen doc={props.doc} lijst="materialen" />
      <Kosteninschatting doc={props.doc} />
      <Bijlage doc={props.doc} />
    </>
  );
}

export function Opleverrapport(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  return (
    <>
      <Kop
        doc={props.doc}
        titel="Opleverrapport regenwater"
        extra={[
          ['Uitgevoerd door', naamVan(props.doc, d().uitvoerder_id)],
          ['Opgeleverd op', d().werk_opgeleverd_at ? kortDatum(d().werk_opgeleverd_at!) : null],
        ]}
      />
      <h2>Uitvoering</h2>
      <Alinea doc={props.doc} key="uitgevoerd" />
      <Fotos doc={props.doc} slot="opleverfotos" />
      <h3>Gebruikte materialen</h3>
      <Materialen doc={props.doc} lijst="gebruikt" />
    </>
  );
}
