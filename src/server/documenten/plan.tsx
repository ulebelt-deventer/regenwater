import { For, type JSX, Show } from 'solid-js';
import { DOORLAATBAARHEID } from '../../shared/constants.ts';
import { kortDatum } from '../../shared/datum.ts';
import { getal, kaartAnnotaties, kaartFoto, kaartItems, waterberging } from '../../shared/kaart.ts';
import { str } from '../../shared/status.ts';
import { BEOORDELINGEN, lijst, materiaalRijen, optieLabel, veld } from '../../shared/velden.ts';
import { Alinea, type Doc, Fotos, FotoMetTekening, Keuze, Kop, Leeg, Of, eigenaar, fotosIn, heeft, naamVan } from './onderdelen.tsx';

function Materialen(props: { doc: Doc; lijst: 'materialen' | 'gebruikt' }): JSX.Element {
  const rijen = () => materiaalRijen(props.doc.d, props.lijst).filter((r) => r.naam.trim() && r.aantal !== null && r.aantal > 0);
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

function Regenwatervolume(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const items = () => kaartItems(d());
  const kaart = () => kaartFoto(d());
  const huurKoop = () => {
    const hk = optieLabel(veld('huur_koop'), d(), 'huur_koop');
    const e = eigenaar(d());
    return hk && d().huur_koop === 'huur' && e ? `${hk}, ${e}` : hk;
  };
  const regenpijpLabels = (ids: string[]) => ids.map((id) => items().labels.get(id)!).join(', ');
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
              <figcaption>Kadastrale kaart met dakdelen (D), tuindelen (T) en regenpijpen (A, B, ...)</figcaption>
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
              <th>Dak</th>
              <th class="getal">Oppervlakte*</th>
              <th>Regenpijpen</th>
              <th>Waterberging**</th>
            </tr>
          </thead>
          <tbody>
            <For each={items().daken}>
              {(dak) => {
                const wb = waterberging(dak);
                return (
                  <tr>
                    <td>{dak.label}</td>
                    <td class="getal">{dak.m2 === null ? <Leeg doc={props.doc} /> : `${getal(dak.m2)} m²`}</td>
                    <td>{dak.regenpijpen.length ? regenpijpLabels(dak.regenpijpen) : '--'}</td>
                    <td>{wb ? wb.uitleg : '-- (geen regenpijp)'}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
        <p class="voetnoot">* bron: kadastrale kaart (PDOK)</p>
        <p class="voetnoot">** per regenpijp gebaseerd op normafvoer 20 mm regenwater</p>
      </Show>
    </>
  );
}

function Infiltratie(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const tuinen = () => kaartItems(d()).tuinen;
  const verhard = () => (typeof d().data.verhard === 'number' ? `${getal(d().data.verhard as number)}%` : null);
  return (
    <>
      <h2>2. Infiltratie</h2>
      <Show when={tuinen().length > 0}>
        <table class="tabel">
          <thead>
            <tr>
              <th>Tuin</th>
              <th class="getal">Oppervlakte</th>
            </tr>
          </thead>
          <tbody>
            <For each={tuinen()}>
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
      <Show when={verhard() || props.doc.concept}>
        <p>
          <strong>Verhard:</strong> <Of doc={props.doc} v={verhard()} />
        </p>
      </Show>
      <h3>Tuinsituatie</h3>
      <Alinea doc={props.doc} key="tuinsituatie" />
      <Fotos doc={props.doc} slot="tuinsituatie" />
      <h3>Wat gebeurt er bij hoosbuien?</h3>
      <Alinea doc={props.doc} key="hoosbuien" />
      <Fotos doc={props.doc} slot="hoosbuien" />
      <For each={tuinen().filter((t) => fotosIn(d(), `tuin.${t.id}`).length > 0)}>
        {(t) => <Fotos doc={props.doc} slot={`tuin.${t.id}`} onderschrift={`Tuin ${t.label}`} />}
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

function Lijst(props: { doc: Doc; key: string; details: string }): JSX.Element {
  const keuzes = () => {
    const v = veld(props.key);
    return lijst(props.doc.d, props.key).map((k) => v.opties!.find(([o]) => o === k)![1]);
  };
  const details = () => str(props.doc.d, props.details);
  return (
    <Show when={keuzes().length > 0 || details()} fallback={<Show when={props.doc.concept}><p><Leeg doc={props.doc} /></p></Show>}>
      <Show when={keuzes().length > 0}>
        <ul>
          <For each={keuzes()}>{(k) => <li>{k}</li>}</For>
        </ul>
      </Show>
      <Show when={details()}>
        <p>{details()}</p>
      </Show>
    </Show>
  );
}

function PlanVanAanpak(props: { doc: Doc }): JSX.Element {
  const d = () => props.doc.d;
  const pijpen = () => kaartItems(d()).regenpijpen;
  const labels = () => kaartItems(d()).labels;
  const k = (id: string, veldNaam: string) => `regenpijp.${id}.${veldNaam}`;
  const kies = (id: string, veldNaam: string) => optieLabel(veld(`regenpijp.*.${veldNaam}`), d(), k(id, veldNaam));
  const beoordeling = () => {
    const b = d().data.beoordeling;
    const r = BEOORDELINGEN.find(([key]) => key === b);
    return r ? r[2] : null;
  };
  const voorstel = () =>
    lijst(d(), 'voorstel')
      .map((id) => str(d(), `voorstel.${id}.tekst`))
      .filter((t): t is string => t !== null);
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
                  <td>{r.dak ? labels().get(r.dak)! : '--'}</td>
                  <td><Of doc={props.doc} v={kies(r.id, 'soort')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'diameter')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'regenton')} /></td>
                  <td><Of doc={props.doc} v={kies(r.id, 'afkoppelen')} /></td>
                  <td>
                    <Of doc={props.doc} v={str(d(), k(r.id, 'waar'))} />
                    <Show when={kies(r.id, 'hoe')}>
                      <br />
                      <span class="klein">Via: {kies(r.id, 'hoe')}</span>
                    </Show>
                    <Show when={str(d(), k(r.id, 'ondergrond'))}>
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
            <For each={['ondergrond', 'waar', 'hoe']}>
              {(s) => <Fotos doc={props.doc} slot={k(r.id, s)} onderschrift={`Regenpijp ${r.label}`} />}
            </For>
          )}
        </For>
      </Show>
      <h3>Wensen van de bewoner</h3>
      <Alinea doc={props.doc} key="wensen" />
      <h3>Voorstel Ulebelt</h3>
      <Show when={beoordeling() || props.doc.concept}>
        <p>
          <Of doc={props.doc} v={beoordeling()} />
        </p>
      </Show>
      <Show when={heeft(d(), 'beoordeling_toelichting')}>
        <p>{str(d(), 'beoordeling_toelichting')}</p>
      </Show>
      <Show when={voorstel().length > 0} fallback={<Show when={props.doc.concept}><p><Leeg doc={props.doc} /></p></Show>}>
        <p>De Ulebelt stelt de volgende werkzaamheden voor:</p>
        <ul>
          <For each={voorstel()}>{(t) => <li>{t}</li>}</For>
        </ul>
      </Show>
      <h3>Afspraken</h3>
      <p>
        <strong>Wat gaat de bewoner doen?</strong>
      </p>
      <Lijst doc={props.doc} key="bewoner_doet" details="bewoner_doet_details" />
      <p>
        <strong>Wat gaat De Ulebelt doen?</strong>
      </p>
      <Lijst doc={props.doc} key="ulebelt_doet" details="ulebelt_doet_details" />
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
                {([g, w]) => (
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
      <h2>5. Materialenlijst en uitvoering</h2>
      <Materialen doc={props.doc} lijst="materialen" />
      <h3>Werkzaamheden</h3>
      <Alinea doc={props.doc} key="werkzaamheden" />
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
