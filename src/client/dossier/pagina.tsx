// The dossier route: loads one dossier for the details page and its sub-pages, with the shared title, menu and banners.
import { A, type RouteSectionProps, useLocation, useNavigate, useParams } from '@solidjs/router';
import { For, type JSX, Match, Show, Switch, createEffect, createResource, createSignal, onMount } from 'solid-js';
import { type Bevinding, KLOPT_NIET_KOP } from '../../shared/aandacht.ts';
import { datum, datumTijd } from '../../shared/datum.ts';
import { PLAN_BEWONER_SJABLONEN, adresRegel, ijskastLabel, laatsteVerzending, sectieOpen, stap, str } from '../../shared/status.ts';
import { geenSpecificatie } from '../../shared/specificatie.ts';
import type { Notificatie, SluitReden } from '../../shared/types.ts';
import { veld } from '../../shared/velden.ts';
import { ApiFout, get, post } from '../api.ts';
import { leesDossier } from '../bel.tsx';
import { Dropdown, Laden, StatusLabel, bevestig, gaNaar, melding, probeer, tip, titel } from '../ui.tsx';
import { EigenaarKiezer, MailKnop, MijlpaalRegel, IJskastModal, SluitModal, Toewijzen, VerbergKnop, VerwijderModal, VerzendRegel, actie, verbergMeldingen, verstuurdSinds, zetMijlpaal } from './acties.tsx';
import { type Antwoord, DossierCtx, haalDossier, maakStaat, useDossier } from './staat.ts';
import { BezoekSamenvatting, InschrijvingSamenvatting, PlanSamenvatting, UitvoeringSamenvatting } from './samenvatting.tsx';
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

// Returns to the details page with `sectie` at the top of the screen; noScroll skips the router's scroll to the top.
export function TerugLink(props: { sectie?: string; class?: string }) {
  const s = useDossier();
  return <A href={`/dossiers/${s.id}`} state={props.sectie ? { sectie: props.sectie } : undefined} noScroll={!!props.sectie} class={`d-inline-block qa-terug ${props.class ?? 'mb-3'}`}>← Terug naar dossier</A>;
}

// What a sub-page's finish button does once its milestone is set: back to the details page at the finished section, like TerugLink.
export function useNaarSectie() {
  const s = useDossier();
  const navigate = useNavigate();
  return (sectie: string) => navigate(`/dossiers/${s.id}`, { state: { sectie }, scroll: false });
}

function Kop() {
  const s = useDossier();
  const naarAnker = useGaNaarAnker();
  const [modal, setModal] = createSignal<'sluiten' | 'verwijderen' | 'ijskast' | null>(null);
  const heropenen = async () => {
    if (await actie(s, 'heropenen')) melding('success', 'Dossier heropend.');
  };
  const uitIjskast = async () => {
    if (await actie(s, 'ijskast-uit')) melding('success', 'Dossier uit de ijskast gehaald.');
  };
  return (
    <>
      <div class="d-flex align-items-start gap-2 mb-2">
        <h1 class="mb-0 flex-grow-1 qa-dossier-titel">{adresRegel(s.d)}</h1>
        <Show when={s.beheerder()}>
          <Dropdown knop="" label="Acties" knopClass="btn btn-outline-primary btn-sm qa-dossier-menu" rechts>
            <Show when={s.d.gesloten_at}>
              <button type="button" class="dropdown-item qa-heropenen" onClick={() => void heropenen()}><i class="bi bi-unlock me-2" aria-hidden="true" />Dossier heropenen</button>
            </Show>
            <Show when={!s.d.gesloten_at}>
              <Show when={s.ijskast()} fallback={<button type="button" class="dropdown-item qa-menu-ijskast" onClick={() => setModal('ijskast')}><i class="bi bi-snow me-2" aria-hidden="true" />Dossier in ijskast doen</button>}>
                <button type="button" class="dropdown-item qa-menu-ijskast-uit" onClick={() => void uitIjskast()}><i class="bi bi-snow me-2" aria-hidden="true" />Uit de ijskast halen</button>
              </Show>
            </Show>
            <A class="dropdown-item qa-menu-activiteit" href={`/dossiers/${s.id}/activiteit`}><i class="bi bi-clock-history me-2" aria-hidden="true" />Alle activiteit</A>
            <div class="dropdown-divider" />
            <Show when={!s.d.gesloten_at}>
              <button type="button" class="dropdown-item text-warning qa-menu-sluiten" onClick={() => setModal('sluiten')}><i class="bi bi-lock me-2" aria-hidden="true" />Dossier sluiten</button>
            </Show>
            <button type="button" class="dropdown-item text-danger qa-menu-verwijderen" onClick={() => setModal('verwijderen')}><i class="bi bi-trash3 me-2" aria-hidden="true" />Dossier verwijderen</button>
          </Dropdown>
        </Show>
      </div>

      <DossierMeldingen />

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

      <Show when={s.ijskast()}>
        {(k) => (
          <div class="alert alert-info qa-ijskast">
            <div class="fw-semibold"><i class="bi bi-snow me-2" aria-hidden="true" />{ijskastLabel(k())}</div>
            <div class="pre-wrap mt-1">{k().reden}</div>
            <div class="small text-muted mt-1">In de ijskast gedaan op {datum(k().created_at)} door {s.naam(k().created_by)}</div>
          </div>
        )}
      </Show>

      <Show when={s.aandacht()}>
        {(a) => {
          const kloptNiet = () => a().bevindingen.filter((b) => b.soort === 'klopt_niet');
          const overig = () => a().bevindingen.filter((b) => b.soort !== 'klopt_niet');
          const allesVerbergen = async () => {
            if (await bevestig('Alle meldingen verbergen?', 'Deze meldingen komen bij dit dossier niet meer terug. Nieuwe meldingen wel.', { ja: 'Verbergen' })) {
              await verbergMeldingen(s, [...kloptNiet(), ...overig()].map((b) => b.sleutel));
            }
          };
          // A link, not a button, so the reason can be selected and copied; draggable={false} lets a drag select text instead of dragging the link.
          const regel = (b: Bevinding) => (
            <li class="qa-bevinding">
              <a href={`#${b.anker}`} class="text-reset text-decoration-none qa-bevinding-link" draggable={false} onClick={(e) => { e.preventDefault(); naarAnker(b.anker); }}>{b.tekst}</a>
              <VerbergKnop sleutel={b.sleutel} />
            </li>
          );
          const uitleg = () => <A href="/uitleg/aandacht" class="link-danger qa-aandacht-uitleg" ref={tip('Waarom zie ik dit?')} aria-label="Waarom zie ik dit?"><i class="bi bi-question-circle" aria-hidden="true" /></A>;
          return (
            <Show when={a().nodig}>
              <div class="alert alert-danger d-flex align-items-start gap-2 qa-aandacht">
                <div class="flex-grow-1">
                  <Show when={kloptNiet().length}>
                    <div class="fw-semibold">{KLOPT_NIET_KOP}</div>
                    <ul class="mb-0 qa-klopt-niet">
                      <For each={kloptNiet()}>{regel}</For>
                    </ul>
                  </Show>
                  <Show when={overig().length}>
                    <ul class="mb-0">
                      <For each={overig()}>{regel}</For>
                    </ul>
                  </Show>
                </div>
                <div class="d-flex align-items-center gap-2 flex-shrink-0">
                  {uitleg()}
                  <button type="button" class="btn btn-link link-danger p-0 qa-alles-verbergen" ref={tip('Alles verbergen')} aria-label="Alles verbergen" onClick={() => void allesVerbergen()}><i class="bi bi-x-lg" aria-hidden="true" /></button>
                </div>
              </div>
            </Show>
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
        <Match when={modal() === 'ijskast'}>
          <IJskastModal onSluit={() => setModal(null)} />
        </Match>
      </Switch>
    </>
  );
}

// The beheerder's meldingen that nothing else on the page tells, in full until clicked away. Opening the dossier marks all its meldingen read.
function DossierMeldingen() {
  const s = useDossier();
  const [lijst, setLijst] = createSignal<Notificatie[]>([]);
  onMount(() => {
    if (!s.beheerder()) return;
    leesDossier(s.id);
    void probeer(async () => setLijst(await get<Notificatie[]>(`/api/notificaties/dossier/${s.id}`)));
  });
  const wegklikken = (n: Notificatie) => void probeer(async () => setLijst(await post<Notificatie[]>(`/api/notificaties/${n.id}/wegklikken`)));
  return (
    <For each={lijst()}>
      {(n) => (
        <div class={`alert ${n.soort === 'ijskast' ? 'alert-info' : 'alert-warning'} d-flex align-items-start gap-2 qa-dossier-melding`}>
          <i class={`bi ${n.soort === 'ijskast' ? 'bi-snow' : 'bi-envelope-exclamation'}`} aria-hidden="true" />
          <div class="flex-grow-1 overflow-hidden">
            <div class="pre-wrap text-break qa-dossier-melding-tekst">{n.titel}</div>
            <div class="small text-muted mt-1">{datumTijd(n.created_at)}</div>
          </div>
          <button type="button" class="btn btn-link text-reset p-0 flex-shrink-0 qa-dossier-melding-weg" ref={tip('Wegklikken')} aria-label="Wegklikken" onClick={() => wegklikken(n)}><i class="bi bi-x-lg" aria-hidden="true" /></button>
        </div>
      )}
    </For>
  );
}

// ---- Details page ----

// With `poort`, the section stays a gray block until sectieOpen lets it open.
function Sectie(props: { id: string; titel: string; poort?: boolean; actie?: JSX.Element; children: JSX.Element }) {
  const s = useDossier();
  return (
    <Show when={!props.poort || sectieOpen(s.d, props.id)} fallback={<DichteSectie id={props.id} titel={props.titel} />}>
      <section id={props.id} class={`sectie card card-body shadow-sm mb-3 qa-${props.id}`}>
        <div class="d-flex align-items-start gap-2 mb-2">
          <h2 class="flex-grow-1 mb-0">{props.titel}</h2>
          {props.actie}
        </div>
        {props.children}
      </section>
    </Show>
  );
}

// A later step's section before it opens: grayed out, so you can see what is still to come. It keeps the id so links to it still scroll.
function DichteSectie(props: { id: string; titel: string }) {
  const s = useDossier();
  return (
    <section id={props.id} class={`card card-body shadow-sm mb-3 bg-body-secondary text-body-secondary qa-dicht qa-dicht-${props.id}`}>
      <h2 class="mb-1">{props.titel}</h2>
      <div class="qa-dicht-reden">{dichtReden(s.d.gesloten_reden, str(s.d, 'rioolstelsel') === 'gescheiden')}</div>
    </section>
  );
}

// At the bottom of an open section whose milestone isn't ticked yet, so the next sections staying gray explains itself.
function NogNiet(props: { stap: string; pad: string; eerst: string; mag: boolean; link?: boolean }) {
  const s = useDossier();
  return (
    <Show when={!s.d.gesloten_at && stap(props.stap).gedaan(s.d) === null}>
      <div class="text-warning mt-2 qa-nog-niet">
        <i class="bi bi-exclamation-triangle me-1" aria-hidden="true" />
        {stap(props.stap).regel}.
        <Show when={props.link ?? true}>
          {' '}<A href={`/dossiers/${s.id}/${props.pad}`} class="qa-nog-niet-link">{props.mag ? props.eerst : 'Bekijken'}</A>
        </Show>
      </div>
    </Show>
  );
}

// Why the later sections aren't open: a closed dossier's reden, a gescheiden riool, or simply earlier steps to finish.
function dichtReden(reden: SluitReden | null, gescheiden: boolean): string {
  if (reden === 'Niet subsidiabel' || (reden === null && gescheiden)) return 'Niet van toepassing: dit adres is niet subsidiabel.';
  if (reden === 'Bewoner doet het zelf') return 'Niet van toepassing: de bewoner doet het werk zelf.';
  if (reden === 'Plan afgewezen') return 'Niet van toepassing: de woningcorporatie heeft het plan afgewezen.';
  if (reden === 'Bewoner afgehaakt') return 'Niet van toepassing: de bewoner is afgehaakt.';
  if (reden !== null) return 'Niet van toepassing: het dossier is gesloten.';
  return 'Nog niet beschikbaar. Rond eerst de eerdere stappen af.';
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
          <span class="fw-semibold me-2">Notities:</span>
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
    const sectie = (loc.state as { sectie?: string } | null)?.sectie;
    // A stale or hidden anchor (eg a section this user can't see, or a step not yet open) just doesn't scroll.
    if (anker) requestAnimationFrame(() => document.getElementById(anker) && gaNaar(anker));
    else if (sectie) {
      requestAnimationFrame(() => {
        const el = document.getElementById(sectie);
        // 'instant': Bootstrap's `scroll-behavior: smooth` would otherwise animate the jump.
        if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 16, behavior: 'instant' });
      });
    }
  });

  const open = () => !s.d.gesloten_at;
  const huur = () => s.d.huur_koop === 'huur';
  const koop = () => s.d.huur_koop === 'koop';
  const naam = (id: number | null) => s.naam(id);

  const stapActie = () => {
    const st = s.status().stap;
    const sub: Record<string, [string, string]> = { inschrijving: ['inschrijving', 'Inschrijving invullen'], bezoek: ['bezoek', 'Start bezoek'], plan: ['plan', 'Plan van Aanpak invullen'], uitvoering: ['uitvoering', 'Uitvoering invullen'] };
    return { st, sub: st.key in sub ? sub[st.key] : null };
  };
  // Klussers only get the action for their own steps; the other sections are the admins' work.
  const toonActie = () => open() && (s.beheerder() || s.status().ligtBij === 'bezoeker' || s.status().ligtBij === 'uitvoerder');

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

  const opgeleverd = () => s.d.werk_opgeleverd_at !== null;

  return (
    <>
      <Sectie id="sectie-status" titel="Status">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <span class="text-muted">Volgende stap:</span>
          <A href="/uitleg/statussen" class="me-2 qa-uitleg-statussen" aria-label="Hoe wordt de status bepaald?" ref={tip('Hoe wordt de status bepaald?')}>
            <i class="bi bi-question-circle" aria-hidden="true" />
          </A>
          <StatusLabel label={s.status().label} ligtBij={s.status().ligtBij} />
          <Show when={toonActie()}>
            <Show
              when={stapActie().sub}
              fallback={<button type="button" class="btn btn-link p-0 qa-stap-actie" onClick={() => naarAnker(stapActie().st.key === 'afspraak' ? 'veld-afspraak' : stapActie().st.anker)}>Naar {stapActie().st.label.toLowerCase()}</button>}
            >
              {(sub) => (
                <Show when={sub()[0] !== 'inschrijving' || s.beheerder()}>
                  <A href={`/dossiers/${s.id}/${sub()[0]}`} class="qa-stap-actie">{sub()[1]}</A>
                </Show>
              )}
            </Show>
          </Show>
        </div>
        <Show when={s.beheerder()}>
          <div class="d-flex flex-wrap align-items-center gap-2 mb-3 qa-eigenaar">
            <span class="text-muted qa-eigenaar-label">Eigenaar:</span>
            <span
              class="text-muted me-2 qa-eigenaar-uitleg"
              tabindex="0"
              role="img"
              aria-label="Wat is de eigenaar?"
              ref={tip('Standaard de beheerder die het dossier heeft aangemaakt. De eigenaar is verantwoordelijk voor het dossier en krijgt de meldingen over wat erin gebeurt onder het belletje bovenaan.')}
            >
              <i class="bi bi-question-circle" aria-hidden="true" />
            </span>
            <Show when={open()} fallback={<span class="qa-eigenaar-naam">{naam(s.d.eigenaar_id)}</span>}>
              <EigenaarKiezer />
            </Show>
          </div>
        </Show>
        <Notities />
      </Sectie>

      <Sectie
        id="sectie-inschrijving"
        titel="Inschrijving"
        actie={<Show when={s.beheerder()}><SubpaginaKnop pad="inschrijving" eerst="Invullen" gestart={s.d.inschrijving_afgerond_at !== null} mag={open()} /></Show>}
      >
        <dl class="feiten mb-2">
          <InschrijvingSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="inschrijving_afgerond" label="Inschrijving is compleet" />
        <NogNiet stap="inschrijving" pad="inschrijving" eerst="Invullen" mag={true} link={s.beheerder()} />
      </Sectie>

      <Sectie id="sectie-bezoeker" titel="Bezoeker" poort>
        <Show when={s.beheerder() && open()} fallback={<div class="qa-bezoeker-naam">{naam(s.d.bezoeker_id) ?? <span class="text-muted">Nog niemand</span>}</div>}>
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
        <Show when={s.beheerder() && s.d.bezoeker_id !== null && !open()}>
          <div class="mt-1">
            <VerzendRegel sjablonen={['bezoeker_toegewezen']} sinds={s.d.bezoeker_toegewezen_at} />
          </div>
        </Show>
      </Sectie>

      <Sectie id="sectie-bezoek" titel="Bezoek" poort actie={<SubpaginaKnop pad="bezoek" eerst="Start bezoek" gestart={s.d.bezoek_afgerond_at !== null} mag={s.mag(['bezoeker'])} />}>
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
        <NogNiet stap="bezoek" pad="bezoek" eerst="Start bezoek" mag={s.mag(['bezoeker'])} />
      </Sectie>

      <Sectie id="sectie-plan" titel="Plan van Aanpak" poort actie={<SubpaginaKnop pad="plan" eerst="Invullen" gestart={s.d.klaar_voor_controle_at !== null} mag={s.mag(['bezoeker'])} />}>
        <dl class="feiten mb-2">
          <PlanSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="klaar_voor_controle" label="Klaar voor controle" />
        <div class="mt-2">
          <a href={`/docs/dossiers/${s.id}/concept-plan`} target="_blank" class="small qa-concept-plan">Bekijk concept-Plan</a>
        </div>
        <NogNiet stap="plan" pad="plan" eerst="Invullen" mag={s.mag(['bezoeker'])} />
      </Sectie>

      <Show when={s.beheerder()}>
        <Sectie id="sectie-versturen" titel="Plan versturen & goedkeuring" poort>
          <div class="mb-3">
            <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="qa-plan-pdf"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
          </div>
          <Show when={s.d.huur_koop} fallback={<div class="text-muted">Vul eerst bij de inschrijving in of het een huur- of koopwoning is.</div>}>
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
                    <div class="form-label fw-semibold mb-1">Wat heeft de woningcorporatie besloten?</div>
                    <div class="d-flex flex-wrap align-items-center gap-2">
                      <button type="button" class="btn btn-success qa-akkoord" onClick={() => void zetMijlpaal(s, 'corporatie_akkoord')}>Goedgekeurd</button>
                      <SluitKnop reden="Plan afgewezen" label="Afgewezen: dossier sluiten" class="btn btn-danger qa-afgewezen" />
                    </div>
                  </Show>
                </Show>
                <Show when={koop()}>
                  <MijlpaalRegel mijlpaal="klussendienst_gekozen" label="Bewoner kiest voor de Klussendienst" />
                  <Show when={open() && !s.d.klussendienst_gekozen_at}>
                    <div class="form-label fw-semibold mb-1">Wat kiest de bewoner?</div>
                    <div class="d-flex flex-wrap align-items-center gap-2">
                      <button type="button" class="btn btn-success qa-klussendienst" onClick={() => void zetMijlpaal(s, 'klussendienst_gekozen')}>Klussendienst</button>
                      <SluitKnop reden="Bewoner doet het zelf" label="Doet het zelf: dossier sluiten" class="btn btn-danger qa-zelf" />
                    </div>
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </Sectie>
      </Show>

      <Sectie id="sectie-uitvoerder" titel="Uitvoerder" poort>
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

      <Sectie id="sectie-uitvoering" titel="Uitvoering" poort actie={<SubpaginaKnop pad="uitvoering" eerst="Invullen" gestart={opgeleverd()} mag={s.mag(['uitvoerder'])} />}>
        <div class="mb-3">
          <a href={`/docs/dossiers/${s.id}/plan.pdf`} target="_blank" class="qa-plan-pdf-uitvoering"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Plan van Aanpak (PDF)</a>
        </div>
        <VeldInvoer k="uitvoering_gepland" />
        <dl class="feiten mb-2">
          <UitvoeringSamenvatting />
        </dl>
        <MijlpaalRegel mijlpaal="werk_opgeleverd" label="Werk opgeleverd" />
        <NogNiet stap="uitvoering" pad="uitvoering" eerst="Invullen" mag={s.mag(['uitvoerder'])} />
      </Sectie>

      <Show when={s.beheerder()}>
        <Sectie id="sectie-oplevering" titel="Oplevering" poort>
          <div class="d-flex flex-wrap gap-3 mb-3">
            <a href={`/docs/dossiers/${s.id}/opleverrapport.pdf`} target="_blank" class="qa-opleverrapport"><i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true" />Opleverrapport (PDF)</a>
            <Show when={!geenSpecificatie(s.d)} fallback={<span class="text-muted qa-specificatie-uit">Uitvoeringsspecificatie (voor de factuur)</span>}>
              <a href={`/docs/dossiers/${s.id}/uitvoeringsspecificatie`} target="_blank" class="qa-specificatie">Uitvoeringsspecificatie (voor de factuur)</a>
            </Show>
          </div>
          <Show when={geenSpecificatie(s.d)}>
            {(reden) => <div class="small text-muted mb-2 qa-specificatie-reden">{reden()}</div>}
          </Show>
          <Show when={huur()}>
            <div class="mb-3">
              <MailKnop sjabloon="oplever_corporatie" label="Opleverrapport versturen naar woningcorporatie" />
              <VerzendRegel sjablonen={['oplever_corporatie']} />
            </div>
          </Show>
          <div class="mb-3">
            <MailKnop sjabloon="oplever_bewoner" label="Opleverrapport versturen naar bewoner" />
            <VerzendRegel sjablonen={['oplever_bewoner']} />
          </div>
          <Show when={open()}>
            <button type="button" class="btn btn-success btn-lg qa-uitgevoerd-sluiten" onClick={() => void uitgevoerdSluiten()}>✅ Uitgevoerd: dossier sluiten</button>
          </Show>
        </Sectie>
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
