// The dossier route: loads one dossier for the details page and its sub-pages, with the shared title, menu and banners.
import { A, type RouteSectionProps, useLocation, useNavigate, useParams } from '@solidjs/router';
import { For, type JSX, Match, Show, Switch, createEffect, createResource, createSignal, onMount } from 'solid-js';
import { KLOPT_NIET_KOP } from '../../shared/aandacht.ts';
import { datum, datumTijd } from '../../shared/datum.ts';
import { PLAN_BEWONER_SJABLONEN, adresRegel, laatsteVerzending, str } from '../../shared/status.ts';
import type { SluitReden } from '../../shared/types.ts';
import { veld } from '../../shared/velden.ts';
import { ApiFout, get } from '../api.ts';
import { Dropdown, Laden, StatusLabel, bevestig, gaNaar, melding, probeer, titel } from '../ui.tsx';
import { MailKnop, MijlpaalRegel, SluitModal, Toewijzen, UitstelModal, VerwijderModal, VerzendRegel, actie, verstuurdSinds, zetMijlpaal } from './acties.tsx';
import { type Antwoord, DossierCtx, haalDossier, maakStaat, useDossier } from './staat.ts';
import { BezoekSamenvatting, IntakeSamenvatting, PlanSamenvatting, UitvoeringSamenvatting } from './samenvatting.tsx';
import { VeldInvoer } from './velden.tsx';

export function DossierRoute(props: RouteSectionProps) {
  const params = useParams();
  const [antwoord] = createResource(() => Number(params.id), haalDossier);
  return (
    <Switch fallback={<Laden />}>
      <Match when={antwoord.state === 'errored'}>
        <div class="alert alert-danger qa-dossier-fout">
          {antwoord.error instanceof ApiFout && antwoord.error.status === 404 ? 'Dit dossier bestaat niet (meer).' : (antwoord.error as Error).message}
        </div>
      </Match>
      <Match when={antwoord.state === 'ready' || antwoord.state === 'refreshing' ? antwoord() : null} keyed>
        {(a) => <Geladen eerste={a}>{props.children}</Geladen>}
      </Match>
    </Switch>
  );
}

function Geladen(props: { eerste: Antwoord; children: JSX.Element }) {
  // eslint-disable-next-line solid/reactivity -- a new dossier remounts this component (keyed above)
  const s = maakStaat(props.eerste.dossier.id, props.eerste);
  createEffect(() => titel(adresRegel(s.d)));
  return (
    <DossierCtx.Provider value={s}>
      <Kop />
      {props.children}
    </DossierCtx.Provider>
  );
}

// Scrolls to a section on this page, or goes to the details page at that section.
export function useGaNaarAnker() {
  const s = useDossier();
  const navigate = useNavigate();
  return (anker: string) => {
    if (document.getElementById(anker)) gaNaar(anker);
    else navigate(`/dossiers/${s.id}#${anker}`);
  };
}

export function TerugLink() {
  const s = useDossier();
  return <A href={`/dossiers/${s.id}`} class="d-inline-block mb-3 qa-terug">← Terug naar dossier</A>;
}

function Kop() {
  const s = useDossier();
  const naarAnker = useGaNaarAnker();
  const [modal, setModal] = createSignal<'sluiten' | 'verwijderen' | 'uitstellen' | null>(null);
  const stil = () => {
    const a = s.aandacht();
    return a ? a.bevindingen.find((b) => b.soort === 'ligt_stil' && !b.uitgesteld) : undefined;
  };
  const heropenen = async () => {
    if (await actie(s, 'heropenen')) melding('success', 'Dossier heropend.');
  };
  return (
    <>
      <div class="d-flex align-items-start gap-2 mb-2">
        <h1 class="h3 mb-0 flex-grow-1 qa-dossier-titel">{adresRegel(s.d)}</h1>
        <Show when={s.beheerder()}>
          <Dropdown knop="" label="Acties" knopClass="btn btn-outline-primary btn-sm qa-dossier-menu" rechts>
            <Show when={!s.d.gesloten_at} fallback={<button type="button" class="dropdown-item qa-heropenen" onClick={() => void heropenen()}><i class="bi bi-unlock me-2" aria-hidden="true" />Dossier heropenen</button>}>
              <button type="button" class="dropdown-item qa-menu-sluiten" onClick={() => setModal('sluiten')}><i class="bi bi-lock me-2" aria-hidden="true" />Dossier sluiten</button>
            </Show>
            <Show when={stil()}>
              <button type="button" class="dropdown-item qa-menu-uitstellen" onClick={() => setModal('uitstellen')}><i class="bi bi-alarm me-2" aria-hidden="true" />Aandacht uitstellen</button>
            </Show>
            <A class="dropdown-item qa-menu-activiteit" href={`/dossiers/${s.id}/activiteit`}><i class="bi bi-clock-history me-2" aria-hidden="true" />Alle activiteit</A>
            <div class="dropdown-divider" />
            <button type="button" class="dropdown-item text-danger qa-menu-verwijderen" onClick={() => setModal('verwijderen')}><i class="bi bi-trash3 me-2" aria-hidden="true" />Dossier verwijderen</button>
          </Dropdown>
        </Show>
      </div>

      <Show when={s.d.gesloten_at}>
        {(at) => (
          <div class={`alert ${s.d.gesloten_reden === 'Uitgevoerd' ? 'alert-success' : 'alert-secondary'} qa-gesloten`}>
            <div class="fw-semibold">Gesloten op {datum(at())}: {s.d.gesloten_reden}</div>
            <Show when={s.d.gesloten_toelichting}>
              <div class="pre-wrap mt-1">{s.d.gesloten_toelichting}</div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={s.aandacht()}>
        {(a) => {
          const kloptNiet = () => a().bevindingen.filter((b) => b.soort === 'klopt_niet');
          const overig = () => a().bevindingen.filter((b) => b.soort !== 'klopt_niet' && !b.uitgesteld);
          const uitgesteld = () => a().bevindingen.filter((b) => b.uitgesteld);
          const regel = (b: { tekst: string; anker: string }) => (
            <li>
              {/* align-top: an inline-block's baseline is its last line, which would put the bullet beside a wrapped reason's last line. */}
              <button type="button" class="btn btn-inline btn-link link-danger text-start align-top qa-bevinding" onClick={() => naarAnker(b.anker)}>{b.tekst}</button>
            </li>
          );
          const uitleg = () => <A href="/uitleg/aandacht" class="link-danger qa-aandacht-uitleg" title="Waarom zie ik dit?" aria-label="Waarom zie ik dit?"><i class="bi bi-question-circle" aria-hidden="true" /></A>;
          return (
            <>
              <Show when={a().nodig}>
                <div class="alert alert-danger qa-aandacht">
                  <Show when={kloptNiet().length} fallback={<span class="float-end">{uitleg()}</span>}>
                    <div class="fw-semibold">{KLOPT_NIET_KOP} {uitleg()}</div>
                    <ul class={`${overig().length ? 'mb-2' : 'mb-0'} qa-klopt-niet`}>
                      <For each={kloptNiet()}>{regel}</For>
                    </ul>
                  </Show>
                  <Show when={overig().length}>
                    <ul class="mb-0">
                      <For each={overig()}>{regel}</For>
                    </ul>
                  </Show>
                </div>
              </Show>
              <For each={uitgesteld()}>
                {(b) => <div class="small text-muted mb-2 qa-uitgesteld">Uitgesteld tot {datum(b.uitgesteld!.tot)}: {b.uitgesteld!.notitie}</div>}
              </For>
            </>
          );
        }}
      </Show>

      <Show when={s.herinnering()}>
        {(h) => (
          <div class="alert alert-warning qa-herinnering">
            <button type="button" class="btn btn-link p-0 text-start align-baseline" onClick={() => naarAnker(h().anker)}>{h().tekst}</button>
          </div>
        )}
      </Show>

      <Switch>
        <Match when={modal() === 'sluiten'}>
          <SluitModal onSluit={() => setModal(null)} />
        </Match>
        <Match when={modal() === 'verwijderen'}>
          <VerwijderModal onSluit={() => setModal(null)} onSluiten={() => setModal('sluiten')} />
        </Match>
        <Match when={modal() === 'uitstellen'}>
          <UitstelModal onSluit={() => setModal(null)} />
        </Match>
      </Switch>
    </>
  );
}

// ---- Details page ----

function Sectie(props: { id: string; titel: string; actie?: JSX.Element; children: JSX.Element }) {
  return (
    <section id={props.id} class={`sectie card card-body mb-3 qa-${props.id}`}>
      <div class="d-flex align-items-start gap-2 mb-2">
        <h2 class="flex-grow-1 mb-0">{props.titel}</h2>
        {props.actie}
      </div>
      {props.children}
    </section>
  );
}

// A red link or button that opens the close pop-up with a preset reden.
export function SluitKnop(props: { reden: SluitReden; label: string; class: string }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button type="button" class={props.class} onClick={() => setOpen(true)}>{props.label}</button>
      <Show when={open()}>
        <SluitModal reden={props.reden} onSluit={() => setOpen(false)} />
      </Show>
    </>
  );
}

// The link to a section's sub-page, always in the section's top right corner: a filled `eerst` button while the step
// is still to do, then a pencil "Bewerken" for whoever may still edit it, and an eye "Bekijken" for the rest.
function SubpaginaKnop(props: { pad: string; eerst: string; gestart: boolean; mag: boolean }) {
  const s = useDossier();
  const label = () => (!props.mag ? 'Bekijken' : props.gestart ? 'Bewerken' : props.eerst);
  const icoon = () => (!props.mag ? 'bi-eye' : props.gestart ? 'bi-pencil' : null);
  return (
    <A href={`/dossiers/${s.id}/${props.pad}`} class={`btn ${props.mag && !props.gestart ? 'btn-primary' : 'btn-outline-primary'} btn-sm text-nowrap qa-naar-${props.pad}`}>
      <Show when={icoon()}>{(i) => <i class={`bi ${i()} me-1`} aria-hidden="true" />}</Show>
      {label()}
    </A>
  );
}

// Notities as text, opening into an autosaving textarea on "Bewerken" until it loses focus.
function Notities() {
  const s = useDossier();
  const [open, setOpen] = createSignal(false);
  const tekst = () => str(s.d, 'notities');
  return (
    <Show
      when={open()}
      fallback={
        <div class="qa-notities">
          <span class="fw-semibold me-2">Notities</span>
          <Show when={tekst()} fallback={<span class="text-muted">--</span>}>{(t) => <span class="pre-wrap">{t()}</span>}</Show>
          <Show when={s.mag(veld('notities').bewerkers)}>
            <button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline qa-notities-bewerken" onClick={() => setOpen(true)}>
              <i class="bi bi-pencil me-1" aria-hidden="true" />Bewerken
            </button>
          </Show>
        </div>
      }
    >
      <div
        ref={(el) => requestAnimationFrame(() => el.querySelector('textarea')!.focus())}
        onFocusOut={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}
      >
        <VeldInvoer k="notities" class="mb-0" />
      </div>
    </Show>
  );
}

export function Details() {
  const s = useDossier();
  const loc = useLocation();
  const navigate = useNavigate();
  const naarAnker = useGaNaarAnker();
  onMount(() => {
    const anker = loc.hash.slice(1);
    // A stale or hidden anchor (eg a section this user can't see) just doesn't scroll.
    if (anker) requestAnimationFrame(() => document.getElementById(anker) && gaNaar(anker));
  });

  const open = () => !s.d.gesloten_at;
  const huur = () => s.d.huur_koop === 'huur';
  const koop = () => s.d.huur_koop === 'koop';
  const naam = (id: number | null) => s.naam(id);

  const stapActie = () => {
    const st = s.status().stap;
    const sub: Record<string, [string, string]> = { intake: ['intake', 'Intake invullen'], bezoek: ['bezoek', 'Start bezoek'], plan: ['plan', 'Plan van Aanpak invullen'], uitvoering: ['uitvoering', 'Uitvoering invullen'] };
    return { st, sub: st.key in sub ? sub[st.key] : null };
  };
  // Klussers only get the action for their own steps; the other sections are the admins' work.
  const toonActie = () => open() && (s.beheerder() || s.status().ligtBij === 'klusser');

  const oproep = async () => {
    await probeer(async () => {
      const r = await get<{ tekst: string }>(`/api/dossiers/${s.id}/oproep`);
      await navigator.clipboard.writeText(r.tekst);
      melding('success', 'Oproep gekopieerd. Plak hem in de Signal-groep.');
    });
  };

  const opleverVerstuurd = () => laatsteVerzending(s.d, ['oplever_corporatie', 'oplever_bewoner']) !== null;
  const uitgevoerdSluiten = async () => {
    if (!opleverVerstuurd() && !(await bevestig('Dossier sluiten', 'Het opleverrapport is nog niet verstuurd. Toch sluiten?', { ja: 'Toch sluiten' }))) return;
    if (await actie(s, 'sluiten', { reden: 'Uitgevoerd', toelichting: '' })) melding('success', 'Dossier gesloten als uitgevoerd.');
  };

  const naUitvoerder = () => s.d.corporatie_akkoord_at || s.d.klussendienst_gekozen_at || s.d.uitvoerder_id !== null || s.d.werk_opgeleverd_at || s.status().stap.nr >= 9;
  const opgeleverd = () => s.d.werk_opgeleverd_at !== null;

  return (
    <>
      <Sectie id="sectie-status" titel="Status">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <span class="text-muted">Volgende stap</span>
          <A href="/uitleg/statussen" class="small qa-uitleg-statussen" title="Hoe wordt de status bepaald?">?</A>
          <StatusLabel label={s.status().label} ligtBij={s.status().ligtBij} />
          <Show when={toonActie()}>
            <Show
              when={stapActie().sub}
              fallback={<button type="button" class="btn btn-sm btn-outline-primary qa-stap-actie" onClick={() => naarAnker(stapActie().st.key === 'afspraak' ? 'veld-afspraak' : stapActie().st.anker)}>Naar {stapActie().st.label.toLowerCase()}</button>}
            >
              {(sub) => (
                <Show when={sub()[0] !== 'intake' || s.beheerder()}>
                  <A href={`/dossiers/${s.id}/${sub()[0]}`} class="btn btn-sm btn-primary qa-stap-actie">{sub()[1]}</A>
                </Show>
              )}
            </Show>
          </Show>
        </div>
        <Notities />
      </Sectie>

      <Sectie
        id="sectie-intake"
        titel="Intake"
        actie={<Show when={s.beheerder()}><SubpaginaKnop pad="intake" eerst="Invullen" gestart={s.d.intake_afgerond_at !== null} mag={open()} /></Show>}
      >
        <dl class="feiten mb-2">
          <IntakeSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="intake_afgerond" label="Intake is compleet" />
      </Sectie>

      <Sectie id="sectie-bezoeker" titel="Bezoeker">
        <Show
          when={s.beheerder() && open() && s.d.intake_afgerond_at}
          fallback={
            <div class="qa-bezoeker-naam">
              {naam(s.d.bezoeker_id) ?? <span class="text-muted">Nog niemand</span>}
              <Show when={s.beheerder() && open() && s.d.bezoeker_id === null}>
                <div class="small text-muted qa-bezoeker-na-intake">Je kunt een bezoeker toewijzen zodra de intake compleet is.</div>
              </Show>
            </div>
          }
        >
          <div class="d-flex flex-wrap align-items-center gap-2">
            <Toewijzen rol="bezoeker" />
            <Show when={s.d.bezoeker_id !== null}>
              <Show when={!verstuurdSinds(s.d, ['bezoeker_toegewezen'], s.d.bezoeker_toegewezen_at)}>
                <MailKnop sjabloon="bezoeker_toegewezen" label="Bezoeker mailen" class="btn-outline-primary btn-sm" />
              </Show>
              <VerzendRegel sjablonen={['bezoeker_toegewezen']} sinds={s.d.bezoeker_toegewezen_at} opnieuw="bezoeker_toegewezen" />
            </Show>
            <Show when={s.d.bezoeker_id === null}>
              <button type="button" class="btn btn-sm btn-outline-secondary qa-oproep" onClick={() => void oproep()}>Kopieer oproep voor Signal-groep</button>
            </Show>
          </div>
        </Show>
        <Show when={s.beheerder() && s.d.bezoeker_id !== null && !(open() && s.d.intake_afgerond_at)}>
          <div class="mt-1">
            <VerzendRegel sjablonen={['bezoeker_toegewezen']} sinds={s.d.bezoeker_toegewezen_at} />
          </div>
        </Show>
      </Sectie>

      <Sectie id="sectie-bezoek" titel="Bezoek" actie={<SubpaginaKnop pad="bezoek" eerst="Start bezoek" gestart={s.d.bezoek_afgerond_at !== null} mag={s.mag(['bezoeker'])} />}>
        <VeldInvoer k="afspraak" />
        <Show when={s.beheerder()}>
          <div class="mb-3">
            <a href={`/docs/dossiers/${s.id}/bezoekformulier.pdf`} target="_blank" class="small qa-bezoekformulier"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Printbaar bezoekformulier (PDF)</a>
          </div>
        </Show>
        <dl class="feiten mb-2">
          <BezoekSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="bezoek_afgerond" label="Bezoek afgerond" />
      </Sectie>

      <Sectie id="sectie-plan" titel="Plan van Aanpak" actie={<SubpaginaKnop pad="plan" eerst="Invullen" gestart={s.d.klaar_voor_controle_at !== null} mag={s.mag(['bezoeker'])} />}>
        <dl class="feiten mb-2">
          <PlanSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="klaar_voor_controle" label="Klaar voor controle" />
        <div class="mt-2">
          <a href={`/docs/dossiers/${s.id}/concept-plan`} target="_blank" class="small qa-concept-plan">Bekijk concept-Plan</a>
        </div>
      </Sectie>

      <Show when={s.beheerder()}>
        <Sectie id="sectie-versturen" titel="Plan versturen & goedkeuring">
          <div class="mb-3">
            <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="qa-plan-pdf"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
          </div>
          <Show when={s.d.huur_koop} fallback={<div class="text-muted">Vul eerst bij de intake in of het een huur- of koopwoning is.</div>}>
            {(hk) => (
              <>
                <div class="mb-3">
                  <Show when={open()}>
                    <MailKnop sjabloon={`plan_bewoner_${hk()}`} label="Plan versturen naar bewoner" />
                  </Show>
                  <VerzendRegel sjablonen={PLAN_BEWONER_SJABLONEN} ontvanger="bewoner" />
                </div>
                <Show when={huur()}>
                  <div class="mb-3">
                    <Show when={open()}>
                      <MailKnop sjabloon="plan_corporatie" label="Plan versturen naar woningcorporatie" />
                    </Show>
                    <VerzendRegel sjablonen={['plan_corporatie']} ontvanger="corporatie" />
                  </div>
                </Show>
                <Show when={huur()}>
                  <MijlpaalRegel mijlpaal="corporatie_akkoord" label="Woningcorporatie heeft het plan goedgekeurd" />
                  <Show when={open() && !s.d.corporatie_akkoord_at}>
                    <div class="d-flex flex-wrap align-items-center gap-3">
                      <button type="button" class="btn btn-success qa-akkoord" onClick={() => void zetMijlpaal(s, 'corporatie_akkoord')}>✅ Woningcorporatie heeft het plan goedgekeurd</button>
                      <SluitKnop reden="Plan afgewezen" label="Plan afgewezen: dossier sluiten" class="btn btn-link link-danger p-0 qa-afgewezen" />
                    </div>
                  </Show>
                </Show>
                <Show when={koop()}>
                  <MijlpaalRegel mijlpaal="klussendienst_gekozen" label="Bewoner kiest voor de Klussendienst" />
                  <Show when={open() && !s.d.klussendienst_gekozen_at}>
                    <div class="d-flex flex-wrap align-items-center gap-3">
                      <button type="button" class="btn btn-success qa-klussendienst" onClick={() => void zetMijlpaal(s, 'klussendienst_gekozen')}>✅ Bewoner kiest voor de Klussendienst</button>
                      <SluitKnop reden="Bewoner doet het zelf" label="Bewoner doet het zelf: dossier sluiten" class="btn btn-link link-danger p-0 qa-zelf" />
                    </div>
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </Sectie>
      </Show>

      <Show when={naUitvoerder()}>
        <Sectie id="sectie-uitvoerder" titel="Uitvoerder">
          <Show when={s.beheerder() && open()} fallback={<div class="qa-uitvoerder-naam">{naam(s.d.uitvoerder_id) ?? <span class="text-muted">Nog niemand</span>}</div>}>
            <div class="d-flex flex-wrap align-items-center gap-2">
              <Toewijzen rol="uitvoerder" />
              <Show when={s.d.uitvoerder_id !== null}>
                <Show when={!verstuurdSinds(s.d, ['uitvoerder_toegewezen'], s.d.uitvoerder_toegewezen_at)}>
                  <MailKnop sjabloon="uitvoerder_toegewezen" label="Uitvoerder mailen" class="btn-outline-primary btn-sm" />
                </Show>
                <VerzendRegel sjablonen={['uitvoerder_toegewezen']} ontvanger="uitvoerder" sinds={s.d.uitvoerder_toegewezen_at} opnieuw="uitvoerder_toegewezen" />
              </Show>
            </div>
          </Show>
          <Show when={s.d.bezoeker_id !== null}>
            <div class="small text-muted mt-1">Bezoeker was {naam(s.d.bezoeker_id)}.</div>
          </Show>
          <Show when={s.beheerder() && s.d.uitvoerder_id !== null && !open()}>
            <div class="mt-1">
              <VerzendRegel sjablonen={['uitvoerder_toegewezen']} ontvanger="uitvoerder" sinds={s.d.uitvoerder_toegewezen_at} />
            </div>
          </Show>
        </Sectie>

        <Sectie id="sectie-uitvoering" titel="Uitvoering" actie={<SubpaginaKnop pad="uitvoering" eerst="Invullen" gestart={opgeleverd()} mag={s.mag(['uitvoerder'])} />}>
          <div class="mb-3">
            <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="qa-plan-pdf-uitvoering"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
          </div>
          <VeldInvoer k="uitvoering_gepland" />
          <dl class="feiten mb-2">
            <UitvoeringSamenvatting />
          </dl>
          <MijlpaalRegel mijlpaal="werk_opgeleverd" label="Werk opgeleverd" />
        </Sectie>

        <Show when={s.beheerder()}>
          <Sectie id="sectie-oplevering" titel="Oplevering">
            <div class="d-flex flex-wrap gap-3 mb-3">
              <Show when={opgeleverd()} fallback={<span class="text-muted qa-opleverrapport-uit"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Opleverrapport (PDF)</span>}>
                <a href={`/docs/dossiers/${s.id}/opleverrapport.pdf`} target="_blank" class="qa-opleverrapport"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Opleverrapport (PDF)</a>
              </Show>
              <Show when={opgeleverd()} fallback={<span class="text-muted">Materialen met prijzen (voor facturatie)</span>}>
                <a href={`/docs/dossiers/${s.id}/materialen`} target="_blank" class="qa-facturatie">Materialen met prijzen (voor facturatie)</a>
              </Show>
            </div>
            <Show when={!opgeleverd()}>
              <div class="small text-muted mb-2">Beschikbaar zodra de uitvoerder "Werk opgeleverd" heeft aangetikt.</div>
            </Show>
            <Show when={huur()}>
              <div class="mb-3">
                <MailKnop sjabloon="oplever_corporatie" label="Opleverrapport versturen naar woningcorporatie" uit={!opgeleverd()} />
                <VerzendRegel sjablonen={['oplever_corporatie']} />
              </div>
            </Show>
            <div class="mb-3">
              <MailKnop sjabloon="oplever_bewoner" label="Opleverrapport versturen naar bewoner" uit={!opgeleverd()} />
              <VerzendRegel sjablonen={['oplever_bewoner']} />
            </div>
            <Show when={open()}>
              <Show when={opgeleverd()} fallback={<SluitKnop reden="Uitgevoerd" label="✅ Uitgevoerd: dossier sluiten" class="btn btn-success btn-lg qa-uitgevoerd-sluiten" />}>
                <button type="button" class="btn btn-success btn-lg qa-uitgevoerd-sluiten" onClick={() => void uitgevoerdSluiten()}>✅ Uitgevoerd: dossier sluiten</button>
              </Show>
            </Show>
          </Sectie>
        </Show>
      </Show>

      <Show when={s.beheerder()}>
        <div class="small">
          <button type="button" class="btn btn-link btn-sm p-0 qa-activiteit" onClick={() => navigate(`/dossiers/${s.id}/activiteit`)}>Alle activiteit</button>
          <span class="text-muted"> · aangemaakt op {datumTijd(s.d.created_at)} door {naam(s.d.created_by)}</span>
        </div>
      </Show>
    </>
  );
}
