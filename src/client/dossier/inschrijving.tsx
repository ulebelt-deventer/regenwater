// Inschrijving sub-page (admin, at the desk): address, bewoner, woning, subsidie mail, straatfoto, kaart and bodem.
import { A, useNavigate } from '@solidjs/router';
import { For, Show, createSignal, onCleanup } from 'solid-js';
import { BORING_MAX_KM, DOORLAATBAARHEID, RIOOLKAARTEN } from '../../shared/constants.ts';
import { datum } from '../../shared/datum.ts';
import { SUBSIDIE_SJABLONEN, inschrijvingOntbreekt, laatsteVerzending, str, straatNummer } from '../../shared/status.ts';
import type { Dossier, RioolDetectie } from '../../shared/types.ts';
import { get, post } from '../api.ts';
import { Modal, bevestig, melding, probeer, tip } from '../ui.tsx';
import { MailKnop, MijlpaalRegel, zetMijlpaal } from './acties.tsx';
import { FotoSlot, KaartVeld } from './fotos.tsx';
import { SluitKnop, TerugLink } from './pagina.tsx';
import { useDossier } from './staat.ts';
import { VeldInvoer } from './velden.tsx';

const VARIANT: Record<string, string> = {
  subsidie_huur: 'subsidiabel, huurwoning',
  subsidie_koop: 'subsidiabel, koopwoning',
  subsidie_niet: 'niet subsidiabel',
};

export function Inschrijving() {
  const s = useDossier();
  const uit = () => !s.mag([]);
  const sjabloon = () => {
    const riool = str(s.d, 'rioolstelsel');
    if (!riool || !s.d.huur_koop) return null;
    return riool === 'gescheiden' ? 'subsidie_niet' : `subsidie_${s.d.huur_koop}`;
  };
  const verstuurd = () => laatsteVerzending(s.d, SUBSIDIE_SJABLONEN);
  const nietSubsidiabel = () => str(s.d, 'rioolstelsel') === 'gescheiden';
  const ontbreekt = () => inschrijvingOntbreekt(s.d);
  const navigate = useNavigate();
  const naarBezoeker = () => navigate(`/dossiers/${s.id}#sectie-bezoeker`);
  const afronden = async () => {
    const mist = ontbreekt();
    if (mist.length && !(await bevestig('Inschrijving afronden?', `Nog niet ingevuld: ${mist.join(', ')}. Toch als compleet markeren?`, { ja: 'Toch afronden' }))) return;
    if (await zetMijlpaal(s, 'inschrijving_afgerond')) naarBezoeker();
  };

  return (
    <>
      <TerugLink />
      <section class="mb-3 qa-inschrijving">
        <h2>Inschrijving</h2>
        <AdresVeld />
        <div class="row">
          <VeldInvoer k="bewoner_naam" class="col-12 col-md-4 mb-3" />
          <VeldInvoer k="bewoner_email" class="col-12 col-md-4 mb-3" />
          <VeldInvoer k="bewoner_telefoon" class="col-12 col-md-4 mb-3" />
        </div>
        <div class="row">
          <VeldInvoer k="huur_koop" class="col-12 col-md-4 mb-3" />
          <VeldInvoer k="woningeigenaar" class="col-12 col-md-4 mb-3" breed />
          <VeldInvoer k="woningtype" class="col-12 col-md-4 mb-3" breed />
        </div>

        <div class="row">
          <div class="col-12 col-md-6 mb-3">
            <div id="veld-rioolstelsel-kop" class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <div class="form-label fw-semibold mb-0">Rioolstelsel</div>
              <Show when={s.d.adres}>
                {(a) => (
                  <Show when={RIOOLKAARTEN[a().gemeente]} fallback={<span class="small text-danger qa-geen-rioolkaart">Voor {a().gemeente} is nog geen rioolkaart bekend. Vraag de ontwikkelaar om {a().gemeente} toe te voegen.</span>}>
                    {(url) => <a href={url()} target="_blank" rel="noopener" class="small qa-rioolkaart">Rioolkaart</a>}
                  </Show>
                )}
              </Show>
            </div>
            <RioolAutodetectie />
            <VeldInvoer k="rioolstelsel" kaal class="" />
          </div>

          <div id="veld-subsidiemail" class="col-12 col-md-6 mb-3 qa-subsidiemail">
            <div class="form-label fw-semibold mb-1">📧 Mail aan bewoner over subsidie</div>
            <Show when={verstuurd()}>
              {(v) => <div class="text-groen fst-italic mb-1 qa-subsidie-verstuurd">✅ {v().handmatig ? 'Handmatig verstuurd' : 'Verstuurd'} op {datum(v().created_at)} ({VARIANT[v().sjabloon]})</div>}
            </Show>
            <Show when={sjabloon()} fallback={<div class="small text-muted">Kies eerst huur/koop en het rioolstelsel.</div>}>
              {(sj) => (
                <Show when={verstuurd()} fallback={<MailKnop sjabloon={sj()} label={`Mail bewoner: ${VARIANT[sj()]}`} uit={uit()} />}>
                  <MailKnop sjabloon={sj()} label={`Opnieuw mailen: ${VARIANT[sj()]}`} uit={uit()} link />
                </Show>
              )}
            </Show>
          </div>
        </div>

        <Show
          when={!nietSubsidiabel()}
          fallback={
            <div class="mb-3">
              <p class="text-muted mb-2 qa-niet-subsidiabel-uitleg">Met een gescheiden riool is dit adres niet subsidiabel, dus straatfoto, kaart, boorprofiel en bodemsituatie zijn niet nodig. Ze komen terug als je het rioolstelsel op Gemengd zet.</p>
              <Show when={!s.d.gesloten_at}>
                <SluitKnop reden="Niet subsidiabel" label="Dossier sluiten: niet subsidiabel" class="btn btn-danger qa-sluiten-niet-subsidiabel" />
              </Show>
            </div>
          }
        >
          <div class="row">
            <div class="col-12 col-md-6">
              <KaartVeld alvast />
            </div>
            <div id="veld-straatfoto" class="col-12 col-md-6 mb-3 qa-veld-straatfoto">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                <div class="form-label fw-semibold mb-0">Straatfoto</div>
                <Show when={s.d.adres}>
                  {(a) => <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${a().ll[1]},${a().ll[0]}`} target="_blank" rel="noopener" class="small qa-streetview">Open Street View</a>}
                </Show>
              </div>
              <FotoSlot k="straatfoto" />
            </div>
          </div>

          <div class="row">
            <Boorprofiel />
            <div class="col-12 col-md-6">
              <VeldInvoer k="boorlocatie" />
              <Bodemsituatie />
            </div>
          </div>
        </Show>

        <div class="border-top pt-3 qa-controle">
          <Show
            when={!s.d.inschrijving_afgerond_at}
            fallback={
<MijlpaalRegel mijlpaal="inschrijving_afgerond" label="Inschrijving is compleet" />
            }
          >
            <Show when={ontbreekt().length}>
              <div class="text-warning qa-inschrijving-ontbreekt">Nog niet ingevuld: {ontbreekt().join(', ')}.</div>
            </Show>
            <button type="button" class="btn btn-primary mt-2 qa-inschrijving-klaar" disabled={uit()} onClick={() => void afronden()}><i class="bi bi-check-lg me-1" aria-hidden="true" />Inschrijving is compleet</button>
          </Show>
        </div>
        <div class="mt-3 text-center">
          <TerugLink class="" />
        </div>
      </section>
    </>
  );
}

// The app's guess from the gemeente's rioolkaart: shown next to the field, never filled into it, so the admin still checks.
function RioolAutodetectie() {
  const s = useDossier();
  const r = () => (s.d.adres ? s.d.extra.riool : undefined);
  const soort = <K extends RioolDetectie['soort']>(k: K) => {
    const x = r();
    return x && x.soort === k ? (x as Extract<RioolDetectie, { soort: K }>) : null;
  };
  return (
    <Show when={r()}>
      <div class="small mb-1 qa-riool-auto">
        <Show when={soort('niet_ondersteund')}>
          <span class="text-muted qa-riool-auto-niet">Autodetectie van het riool wordt voor {s.d.adres!.gemeente} nog niet ondersteund.</span>
        </Show>
        <Show when={soort('fout')}>{(f) => <span class="text-danger qa-riool-auto-fout">Autodetectie van het riool is mislukt: {f().bericht}</span>}</Show>
        <Show when={soort('gevonden')}>
          {(g) => (
            <>
              <Show when={g().stelsel} fallback={<span class="text-warning qa-riool-auto-onbekend">Autodetectie kan niet zeggen of het riool op dit adres gemengd of gescheiden is.</span>}>
                {(stelsel) => (
                  <span>
                    Autodetectie denkt dat het riool op dit adres <strong class={`qa-riool-auto-${stelsel()} ${stelsel() === 'gemengd' ? 'text-groen' : 'text-danger'}`}>{stelsel()}</strong> is.
                  </span>
                )}
              </Show>{' '}
              <span class="text-muted">({g().uitleg}.) Controleer dit zelf op de rioolkaart.</span>
            </>
          )}
        </Show>
      </div>
    </Show>
  );
}

interface Suggestie {
  id: string;
  weergavenaam: string;
}

function AdresVeld() {
  const s = useDossier();
  const uit = () => !s.mag([]);
  const [q, setQ] = createSignal('');
  const [suggesties, setSuggesties] = createSignal<Suggestie[]>([]);
  // With an address chosen, the search field only shows after tapping the pencil.
  const [zoeken, setZoeken] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let laatste = 0;
  onCleanup(() => clearTimeout(timer));

  // Debounced, and only the newest request's answer is shown, so a slow early reply can't overwrite a later one.
  const zoek = (tekst: string) => {
    setQ(tekst);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const nr = ++laatste;
      void probeer(async () => {
        const r = await get<{ suggesties: Suggestie[] }>(`/api/adres/suggest?q=${encodeURIComponent(tekst)}`);
        if (nr === laatste) setSuggesties(r.suggesties);
      });
    }, 250);
  };
  const kies = async (sug: Suggestie) => {
    setSuggesties([]);
    setQ('');
    setZoeken(false);
    await probeer(async () => {
      const r = await post<{ dossier: Dossier; dubbel: { id: number; gesloten: boolean }[] }>(`/api/dossiers/${s.id}/adres`, { id: sug.id });
      s.vervang(r.dossier);
      s.setDubbel(r.dubbel);
    });
  };

  return (
    <div id="veld-adres" class="mb-3 qa-veld-adres">
      <div class="form-label fw-semibold mb-1">Adres</div>
      <Show when={s.d.adres}>
        {(a) => (
          <div class="mb-1">
            <span class="qa-adres-gekozen">{straatNummer(a())}, {a().postcode} {a().plaats}</span>
            <Show when={!uit()}>
              <button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline qa-adres-wijzigen" aria-label="Ander adres zoeken" ref={tip('Ander adres zoeken')} onClick={() => setZoeken(!zoeken())}>
                <i class="bi bi-pencil" aria-hidden="true" />
              </button>
            </Show>
          </div>
        )}
      </Show>
      <Show when={!uit() && (!s.d.adres || zoeken())}>
        <div class="position-relative">
          <input
            ref={(el) => s.d.adres && queueMicrotask(() => el.focus())}
            class="form-control qa-adres-zoek"
            placeholder={s.d.adres ? 'Ander adres zoeken: straat, huisnummer, plaats of postcode' : 'Straat, huisnummer, plaats of postcode'}
            value={q()}
            onInput={(e) => zoek(e.currentTarget.value)}
          />
          <Show when={suggesties().length && q().trim().length >= 2}>
            <div class="list-group position-absolute w-100 shadow-sm" style={{ 'z-index': 10 }}>
              <For each={suggesties()}>
                {(sug) => (
                  <button type="button" class="list-group-item list-group-item-action qa-adres-suggestie" onClick={() => void kies(sug)}>{sug.weergavenaam}</button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <For each={s.dubbel()}>
        {(x) => (
          <div class="text-danger small mt-1 qa-dubbel">
            Er bestaat al een dossier voor dit adres: <A href={`/dossiers/${x.id}`} class="link-danger">dossier {x.id}</A> ({x.gesloten ? 'gesloten' : 'open'})
          </div>
        )}
      </For>
    </div>
  );
}

function Boorprofiel() {
  const s = useDossier();
  const [bezig, setBezig] = createSignal(false);

  const zoekBoring = async () => {
    const gevuld = s.d.fotos.some((f) => f.slot === 'boorprofiel') || str(s.d, 'boorlocatie');
    if (gevuld && !(await bevestig('Boorprofiel vervangen?', 'Het huidige boorprofiel en de boorlocatie worden vervangen door die van de dichtstbijzijnde boring.', { ja: 'Vervangen' }))) return;
    setBezig(true);
    await probeer(async () => {
      const r = await post<{ boring: { bron: string; id: string; afstand_m: number } | null; dossier: Dossier }>(`/api/dossiers/${s.id}/boring`, {});
      if (!r.boring) {
        melding('warning', `Geen boring gevonden binnen ${BORING_MAX_KM.toLocaleString('nl-NL')} km. Zoek zelf op DINOloket.`);
        return;
      }
      s.vervang(r.dossier);
      melding('success', `Boorprofiel van boring ${r.boring.id} (${r.boring.bron}, ${r.boring.afstand_m} m) toegevoegd.`);
    });
    setBezig(false);
  };

  return (
    <div id="veld-boorprofiel" class="col-12 col-md-6 mb-3 qa-veld-boorprofiel">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
        <div class="form-label fw-semibold mb-0">Boorprofiel</div>
        <Show when={s.beheerder() && s.d.adres}>
          <button type="button" class="btn btn-sm btn-outline-secondary qa-boring" disabled={bezig() || !s.mag([])} onClick={() => void zoekBoring()}>{bezig() ? 'Zoeken...' : 'Dichtstbijzijnde boring ophalen'}</button>
        </Show>
        <a href="https://www.dinoloket.nl/ondergrondgegevens" target="_blank" rel="noopener" class="small qa-dinoloket">DINOloket</a>
      </div>
      <FotoSlot k="boorprofiel" />
    </div>
  );
}

// Its options are the rows of the doorlaatbaarheid reference table, which the link beside the label opens.
function Bodemsituatie() {
  const [tabel, setTabel] = createSignal(false);
  return (
    <div class="mb-3">
      <div id="veld-bodemsituatie-kop" class="d-flex flex-wrap align-items-center gap-2 mb-1">
        <div class="form-label fw-semibold mb-0">Bodemsituatie</div>
        <button type="button" class="btn btn-link btn-sm p-0 qa-doorlaatbaarheid" onClick={() => setTabel(true)}>Referentietabel</button>
      </div>
      <VeldInvoer k="bodemsituatie" kaal class="" breed />
      <Show when={tabel()}>
        <Modal titel="Doorlaatbaarheid per grondsoort" onSluit={() => setTabel(false)} class="qa-doorlaatbaarheid-modal">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>Grondsoort</th>
                <th>Doorlaatbaarheid</th>
              </tr>
            </thead>
            <tbody>
              <For each={DOORLAATBAARHEID}>
                {([, grond, doorlaat]) => (
                  <tr>
                    <td>{grond}</td>
                    <td>{doorlaat}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Modal>
      </Show>
    </div>
  );
}
