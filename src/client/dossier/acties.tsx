// Admin actions on a dossier (pop-ups, assigning) and the small "done/sent" lines the details page repeats per section.
import { A, useNavigate } from '@solidjs/router';
import { For, type JSX, Show, createSignal } from 'solid-js';
import { planStatus } from '../../shared/aandacht.ts';
import { DAG_MS, datum, isoDatum } from '../../shared/datum.ts';
import { laatsteVerzending } from '../../shared/status.ts';
import { type Dossier, type Gebruiker, type Mijlpaal, type Ontvanger, SLUIT_REDENEN, type SluitReden } from '../../shared/types.ts';
import { del, post } from '../api.ts';
import { GebruikerForm } from '../gebruikerform.tsx';
import { nu } from '../sessie.ts';
import { Dropdown, Modal, bevestig, melding, probeer, tip } from '../ui.tsx';
import { MailModal } from './mail.tsx';
import { type DossierStaat, useDossier } from './staat.ts';

// Posts a dossier action and shows the returned dossier; errors become a pop-up.
export function actie(s: DossierStaat, pad: string, inhoud: unknown = {}): Promise<boolean> {
  return probeer(async () => {
    const r = await post<{ dossier: Dossier }>(`/api/dossiers/${s.id}/${pad}`, inhoud);
    s.vervang(r.dossier);
  });
}

export const zetMijlpaal = (s: DossierStaat, mijlpaal: Mijlpaal) => actie(s, 'mijlpaal', { mijlpaal });

export const verbergMeldingen = (s: DossierStaat, sleutels: string[]) => actie(s, 'verbergen', { sleutels });

// The red X behind a melding, for beheerders: hides it on this dossier for good (a Plan gewijzigd until the next change).
export function VerbergKnop(props: { sleutel: string }) {
  const s = useDossier();
  return (
    <Show when={s.beheerder()}>
      <button type="button" class="btn btn-link link-danger p-0 ms-1 align-baseline qa-verberg" ref={tip('Hoeft niet: verbergen')} aria-label="Verbergen" onClick={() => void verbergMeldingen(s, [props.sleutel])}><i class="bi bi-x-lg" aria-hidden="true" /></button>
    </Show>
  );
}

// A pop-up with a form whose submit runs one action and closes on success.
function ActieModal(props: { titel: string; knop: string; knopClass?: string; klaar: boolean; onSluit: () => void; verstuur: () => Promise<boolean>; children: JSX.Element; class?: string; extra?: JSX.Element }) {
  const [bezig, setBezig] = createSignal(false);
  const verstuur = async (e: Event) => {
    e.preventDefault();
    setBezig(true);
    const ok = await props.verstuur();
    setBezig(false);
    if (ok) props.onSluit();
  };
  return (
    <Modal
      titel={props.titel}
      onSluit={() => props.onSluit()}
      class={props.class}
      voet={
        <>
          {props.extra}
          <button type="button" class="btn btn-outline-secondary" onClick={() => props.onSluit()}>Annuleren</button>
          <button type="submit" form="actie-form" class={`btn ${props.knopClass ?? 'btn-primary'} qa-actie-ok`} disabled={bezig() || !props.klaar}>{props.knop}</button>
        </>
      }
    >
      <form id="actie-form" onSubmit={(e) => void verstuur(e)}>{props.children}</form>
    </Modal>
  );
}

// "Toch uitgevoerd" stores reden Uitgevoerd, for work finished outside the normal flow, so it comes last.
const SLUIT_KEUZES: [SluitReden, string][] = [
  ['Bewoner afgehaakt', 'Bewoner afgehaakt'],
  ['Bewoner doet het zelf', 'Bewoner doet het zelf'],
  ['Plan afgewezen', 'Plan afgewezen'],
  ['Niet subsidiabel', 'Niet subsidiabel'],
  ['Anders', 'Anders'],
  ['Uitgevoerd', 'Toch uitgevoerd'],
];
if (SLUIT_KEUZES.length !== SLUIT_REDENEN.length) throw new Error('SLUIT_KEUZES mist een reden');

export function SluitModal(props: { reden?: SluitReden; onSluit: () => void }) {
  const s = useDossier();
  // eslint-disable-next-line solid/reactivity -- the preset reden only seeds the choice
  const [reden, setReden] = createSignal<SluitReden | null>(props.reden ?? null);
  const [toelichting, setToelichting] = createSignal('');
  const verplicht = () => reden() === 'Uitgevoerd' && !s.d.werk_opgeleverd_at;
  return (
    <ActieModal
      titel="Dossier sluiten"
      knop="Dossier sluiten"
      class="qa-sluit-modal"
      klaar={reden() !== null && (!verplicht() || toelichting().trim() !== '')}
      onSluit={() => props.onSluit()}
      verstuur={() => actie(s, 'sluiten', { reden: reden(), toelichting: toelichting() })}
    >
      <div class="mb-3 big-touch">
        <div class="form-label fw-semibold mb-1">Reden</div>
        <For each={SLUIT_KEUZES}>
          {([k, label]) => (
            <div class="form-check">
              <input class={`form-check-input qa-reden-${k.replace(/ /g, '-').toLowerCase()}`} type="radio" name="sluit-reden" id={`reden-${k}`} checked={reden() === k} onChange={() => setReden(k)} />
              <label class="form-check-label" for={`reden-${k}`}>{label}</label>
            </div>
          )}
        </For>
      </div>
      <label class="form-label fw-semibold mb-0" for="sluit-toelichting">Toelichting{verplicht() ? '' : ' (optioneel)'}</label>
      <div class="form-text mt-0 mb-1">{verplicht() ? 'Verplicht: leg uit wat er is gebeurd.' : 'Schrijf kort op waarom het dossier gesloten wordt, voor wie het later terugleest.'}</div>
      <textarea id="sluit-toelichting" class="form-control qa-sluit-toelichting" rows="3" value={toelichting()} onInput={(e) => setToelichting(e.currentTarget.value)} />
    </ActieModal>
  );
}

export function VerwijderModal(props: { onSluit: () => void; onSluiten: () => void }) {
  const s = useDossier();
  const navigate = useNavigate();
  const verwijder = async () => {
    const ok = await probeer(() => del(`/api/dossiers/${s.id}`));
    if (!ok) return;
    melding('success', 'Dossier verwijderd.');
    navigate('/dossiers');
  };
  return (
    <Modal
      titel="Dossier verwijderen"
      onSluit={() => props.onSluit()}
      class="qa-verwijder-modal"
      voet={
        <>
          <button type="button" class="btn btn-primary qa-verwijder-sluiten" onClick={() => props.onSluiten()}>Dossier sluiten</button>
          <button type="button" class="btn btn-danger qa-verwijder-definitief" onClick={() => void verwijder()}>Definitief verwijderen</button>
        </>
      }
    >
      <p>Dit verwijdert het dossier met al zijn gegevens, foto's en activiteit. Dat kan niet ongedaan worden gemaakt.</p>
      <p class="mb-0">Verwijder alleen een dubbel dossier of op verzoek van de bewoner (privacy). Sluit het dossier in alle andere gevallen.</p>
    </Modal>
  );
}

export function UitstelModal(props: { onSluit: () => void }) {
  const s = useDossier();
  const morgen = isoDatum(new Date(nu().getTime() + DAG_MS));
  const [tot, setTot] = createSignal(morgen);
  const [notitie, setNotitie] = createSignal('');
  return (
    <ActieModal
      titel="Aandacht uitstellen"
      knop="Uitstellen"
      class="qa-uitstel-modal"
      klaar={tot() >= morgen && notitie().trim() !== ''}
      onSluit={() => props.onSluit()}
      verstuur={() => actie(s, 'uitstellen', { tot: tot(), notitie: notitie() })}
    >
      <label class="form-label fw-semibold mb-0" for="uitstel-tot">Tot</label>
      <input id="uitstel-tot" type="date" class="form-control w-auto mb-3 qa-uitstel-tot" min={morgen} value={tot()} onInput={(e) => setTot(e.currentTarget.value)} />
      <label class="form-label fw-semibold mb-0" for="uitstel-notitie">Notitie</label>
      <textarea id="uitstel-notitie" class="form-control qa-uitstel-notitie" rows="2" placeholder="Bijvoorbeeld: Ieder1 gebeld, reageren volgende week" value={notitie()} onInput={(e) => setNotitie(e.currentTarget.value)} />
    </ActieModal>
  );
}

function AckModal(props: { ontvanger: Ontvanger; onSluit: () => void }) {
  const s = useDossier();
  const [notitie, setNotitie] = createSignal('');
  return (
    <ActieModal
      titel="Opnieuw versturen niet nodig"
      knop="Opslaan"
      class="qa-ack-modal"
      klaar={notitie().trim() !== ''}
      onSluit={() => props.onSluit()}
      verstuur={() => actie(s, 'ack', { ontvanger: props.ontvanger, notitie: notitie() })}
    >
      <p class="small text-muted">De huidige wijzigingen hoeven niet opnieuw verstuurd te worden. Een latere wijziging geeft weer een waarschuwing.</p>
      <label class="form-label fw-semibold mb-0" for="ack-notitie">Waarom niet?</label>
      <input id="ack-notitie" class="form-control qa-ack-notitie" placeholder="Bijvoorbeeld: alleen een typfout" value={notitie()} onInput={(e) => setNotitie(e.currentTarget.value)} />
    </ActieModal>
  );
}

// ---- Status lines ----

export function MijlpaalRegel(props: { mijlpaal: Mijlpaal; label: string }) {
  const s = useDossier();
  const at = () => s.d[`${props.mijlpaal}_at`];
  const terug = async () => {
    if (await bevestig('Terugdraaien?', `"${props.label}" wordt weer uitgezet.`, { ja: 'Terugdraaien' })) await actie(s, 'mijlpaal', { mijlpaal: props.mijlpaal, aan: false });
  };
  return (
    <Show when={at()}>
      {(t) => (
        <div class={`text-groen qa-mijlpaal qa-mijlpaal-${props.mijlpaal}`}>
          ✅ {props.label} op {datum(t())} ({s.naam(s.d[`${props.mijlpaal}_by`])})
          <Show when={s.beheerder() && !s.d.gesloten_at}>
            {' '}<button type="button" class="btn btn-link btn-sm p-0 align-baseline qa-terugdraaien" onClick={() => void terug()}>Terugdraaien</button>
          </Show>
        </div>
      )}
    </Show>
  );
}

// The latest successful send of these templates, if it was at or after `sinds`.
export function verstuurdSinds(d: Dossier, sjablonen: string[], sinds?: string | null) {
  const v = laatsteVerzending(d, sjablonen);
  return v && (!sinds || v.created_at >= sinds) ? v : null;
}

// The latest send of these templates since `sinds`: green when it arrived, red when it failed. For a plan send (`ontvanger`), amber once the plan changed after it.
// With `opnieuw`, a sent line ends in an "Opnieuw mailen" link that opens that template's send pop-up.
export function VerzendRegel(props: { sjablonen: string[]; ontvanger?: Ontvanger; sinds?: string | null; opnieuw?: string }) {
  const s = useDossier();
  const [ack, setAck] = createSignal(false);
  const [mail, setMail] = createSignal(false);
  const na = (v: { created_at: string }) => !props.sinds || v.created_at >= props.sinds;
  const poging = () => {
    const v = s.d.verzendingen.filter((x) => props.sjablonen.includes(x.sjabloon) && na(x));
    return v.length ? v[v.length - 1] : null;
  };
  const gelukt = () => verstuurdSinds(s.d, props.sjablonen, props.sinds);
  const opnieuw = () => (
    <Show when={props.opnieuw}>
      {' · '}
      <button type="button" class="btn btn-link btn-sm p-0 align-baseline qa-opnieuw-mailen" onClick={() => setMail(true)}>Opnieuw mailen</button>
    </Show>
  );
  const gewijzigd = () => {
    if (!props.ontvanger) return null;
    const p = planStatus(s.d, props.ontvanger);
    return p ? p.gewijzigd : null;
  };
  return (
    <div class="small qa-verzonden">
      <Show when={poging() && poging()!.mislukt_at}>
        <div class="text-danger qa-niet-afgeleverd">Niet afgeleverd op {datum(poging()!.mislukt_at!)} ({poging()!.aan})</div>
      </Show>
      <Show when={gelukt()}>
        {(v) => (
          <Show
            when={gewijzigd()}
            fallback={<div><span class="text-groen fst-italic qa-verstuurd">✅ {v().handmatig ? 'Handmatig verstuurd' : 'Verstuurd'} op {datum(v().created_at)}</span>{opnieuw()}</div>}
          >
            {(g) => (
              <div class="text-warning qa-plan-gewijzigd">
                {v().handmatig ? 'Handmatig verstuurd' : 'Verstuurd'} op {datum(v().created_at)}, plan daarna gewijzigd op {datum(g())}.{' '}
                <A href={`/dossiers/${s.id}/activiteit?sinds=${encodeURIComponent(v().created_at)}`} class="qa-wijzigingen">Wat is er gewijzigd?</A>
                {opnieuw()}
                <Show when={s.beheerder() && !s.d.gesloten_at}>
                  {' · '}
                  <button type="button" class="btn btn-link btn-sm p-0 align-baseline qa-niet-nodig" onClick={() => setAck(true)}>Opnieuw versturen niet nodig</button>
                </Show>
                <Show when={ack()}>
                  <AckModal ontvanger={props.ontvanger!} onSluit={() => setAck(false)} />
                </Show>
              </div>
            )}
          </Show>
        )}
      </Show>
      <Show when={mail() && props.opnieuw}>{(sj) => <MailModal sjabloon={sj()} onSluit={() => setMail(false)} />}</Show>
    </div>
  );
}

// A button that opens the send pop-up for one template.
// `link`: a plain link without the envelope, for a mail that was already sent, so it doesn't read as a to-do.
export function MailKnop(props: { sjabloon: string; label: string; class?: string; uit?: boolean; link?: boolean }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button type="button" class={`btn ${props.link ? 'btn-link btn-sm p-0 align-baseline' : (props.class ?? 'btn-outline-primary')} qa-mail-${props.sjabloon}`} disabled={props.uit} onClick={() => setOpen(true)}>{props.link ? '' : '📧 '}{props.label}</button>
      <Show when={open()}>
        <MailModal sjabloon={props.sjabloon} onSluit={() => setOpen(false)} />
      </Show>
    </>
  );
}

// ---- Assigning a bezoeker or uitvoerder ----

export function Toewijzen(props: { rol: 'bezoeker' | 'uitvoerder' }) {
  const s = useDossier();
  const [zoek, setZoek] = createSignal('');
  const [nieuw, setNieuw] = createSignal(false);
  const [mail, setMail] = createSignal(false);
  const huidig = () => s.d[`${props.rol}_id`];
  const kandidaten = () => {
    const q = zoek().trim().toLowerCase();
    return s.gebruikers()
      .filter((g) => (!g.archived_at || g.id === huidig()) && g.naam.toLowerCase().includes(q))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  };

  const wijs = async (g: Gebruiker | null, nieuweGebruiker = false) => {
    if ((g ? g.id : null) === huidig()) return;
    if (props.rol === 'bezoeker' && s.d.bezoek_afgerond_at && huidig() !== null && g) {
      const ja = await bevestig('Bezoeker wijzigen', `Hiermee verandert ook "Schouw door" in het Plan van Aanpak van ${s.naam(huidig())} naar ${g.naam}. Weet je het zeker?`, { ja: 'Wijzigen' });
      if (!ja) return;
    }
    // A new account isn't in the loaded user list yet, and the page names the assignee as soon as the dossier comes back.
    if (nieuweGebruiker) await s.herlaad();
    const ok = await actie(s, 'toewijzen', { rol: props.rol, gebruiker_id: g ? g.id : null });
    if (!ok) return;
    if (g) setMail(true);
  };

  return (
    <div class={`qa-toewijzen qa-toewijzen-${props.rol}`}>
      <Dropdown knop={huidig() === null ? 'Kies...' : s.naam(huidig())} knopClass="form-select text-start qa-toewijzen-knop" kiezer>
        <div class="px-2 pb-1" onClick={(e) => e.stopPropagation()}>
          <input class="form-control form-control-sm qa-toewijzen-zoek" placeholder="Zoeken..." value={zoek()} onInput={(e) => setZoek(e.currentTarget.value)} />
        </div>
        <button type="button" class="dropdown-item qa-kandidaat-niemand" classList={{ active: huidig() === null, 'text-muted': huidig() !== null }} onClick={() => void wijs(null)}>- niemand -</button>
        <For each={kandidaten()}>
          {(g) => (
            <button type="button" class={`dropdown-item qa-kandidaat qa-kandidaat-${g.id}`} classList={{ active: g.id === huidig() }} onClick={() => void wijs(g)}>
              {g.naam}
              <Show when={g.rol === 'beheerder'}>
                <span class="small" classList={{ 'text-muted': g.id !== huidig() }}> (beheerder)</span>
              </Show>
            </button>
          )}
        </For>
        <div class="dropdown-divider" />
        <button type="button" class="dropdown-item qa-nieuwe-klusser" onClick={() => setNieuw(true)}><i class="bi bi-plus-lg me-2" aria-hidden="true" />Nieuwe klusser</button>
      </Dropdown>
      <Show when={nieuw()}>
        <GebruikerForm
          vasteRol="klusser"
          onSluit={() => setNieuw(false)}
          onOpgeslagen={(g) => {
            setNieuw(false);
            void wijs(g, true);
          }}
        />
      </Show>
      <Show when={mail()}>
        <MailModal sjabloon={`${props.rol}_toegewezen`} onSluit={() => setMail(false)} />
      </Show>
    </div>
  );
}
