// Beheer pages (admin): Normafvoer, Materialen, E-mailsjablonen and Feedback.
import { A, useParams } from '@solidjs/router';
import { For, Show, createResource, createSignal } from 'solid-js';
import { NORM_STANDAARD_LABEL } from '../../shared/constants.ts';
import { datum, datumTijd } from '../../shared/datum.ts';
import { controleerTags, probleemTeksten, sjabloonDef } from '../../shared/sjablonen.ts';
import type { NormafvoerRij } from '../../shared/types.ts';
import { del, get, patch, post, put, query } from '../api.ts';
import { AlleenBeheerder, Kruimels, Laden, bevestig, melding, probeer, titel } from '../ui.tsx';

// ---- Normafvoer ----

interface Normen {
  normafvoeren: NormafvoerRij[];
  gemeenten: string[];
}

export function NormafvoerBeheer() {
  titel('Normafvoer');
  return (
    <AlleenBeheerder>
      <NormafvoerInhoud />
    </AlleenBeheerder>
  );
}

function NormafvoerInhoud() {
  const [data, { mutate }] = createResource(() => get<Normen>('/api/normafvoeren'));
  const [gemeente, setGemeente] = createSignal('');
  const [mm, setMm] = createSignal('');
  const vrij = () => {
    const bezet = new Set(data()!.normafvoeren.map((n) => n.gemeente));
    return data()!.gemeenten.filter((g) => !bezet.has(g));
  };

  const toevoegen = async (e: Event) => {
    e.preventDefault();
    const naam = gemeente().trim();
    if (!data()!.gemeenten.includes(naam) && !(await bevestig(`${naam} toevoegen?`, 'Deze naam kennen we nog niet uit de dossiers. Hij moet precies zo geschreven zijn als in het adres, anders geldt de norm niet.', { ja: 'Toevoegen' }))) return;
    if (await probeer(async () => mutate(await post<Normen>('/api/normafvoeren', { gemeente: naam, mm: Number(mm()) })))) {
      setGemeente('');
      setMm('');
    }
  };
  const wijzig = async (n: NormafvoerRij, invoer: HTMLInputElement) => {
    if (Number(invoer.value) === n.mm) return;
    if (!(await probeer(async () => mutate(await patch<Normen>(`/api/normafvoeren/${n.id}`, { mm: Number(invoer.value) }))))) invoer.value = String(n.mm);
  };
  const nagekeken = (n: NormafvoerRij) => probeer(async () => mutate(await post<Normen>(`/api/normafvoeren/${n.id}/nagekeken`)));
  const verwijder = async (n: NormafvoerRij) => {
    if (!(await bevestig(`${n.gemeente} verwijderen?`, 'Dossiers in deze gemeente krijgen dan de standaardnorm, tenzij hun Bezoek al is geopend.', { ja: 'Verwijderen', gevaar: true }))) return;
    await probeer(async () => mutate(await del<Normen>(`/api/normafvoeren/${n.id}`)));
  };

  return (
    <>
      <h1>Normafvoer</h1>
      <p class="text-muted">De regenval waarmee de app de waterberging per regenpijp berekent. Een gemeente zonder eigen rij krijgt de standaardnorm. Een dossier houdt de norm vanaf het moment dat het Bezoek voor het eerst wordt geopend, dus een wijziging hier geldt alleen voor dossiers waarvan het Bezoek nog niet is geopend. Elk jaar vraagt de mail Aandacht nodig om de normen na te kijken.</p>
      <Show when={data()} fallback={<Laden />}>
        <div class="table-responsive">
          <table class="table align-middle qa-normen" style={{ 'max-width': '42rem' }}>
            <thead>
              <tr>
                <th>Gemeente</th>
                <th style={{ width: '6rem' }}>Norm (mm)</th>
                <th colspan="2">Nagekeken</th>
              </tr>
            </thead>
            <tbody>
              <For each={data()!.normafvoeren}>
                {(n) => (
                  <tr class="qa-norm-rij">
                    <td class="qa-norm-gemeente">{n.gemeente ?? NORM_STANDAARD_LABEL}</td>
                    <td><input class="form-control form-control-sm qa-norm-mm" type="number" min="1" max="100" step="1" aria-label={`Norm in mm, ${n.gemeente ?? NORM_STANDAARD_LABEL}`} value={n.mm} onChange={(e) => wijzig(n, e.currentTarget)} /></td>
                    <td class="text-nowrap">
                      <span class="me-2 qa-norm-nagekeken">{datum(n.gecontroleerd_at)}</span>
                      <button type="button" class="btn btn-outline-secondary btn-sm qa-norm-nagekeken-knop" onClick={() => nagekeken(n)}>Nagekeken</button>
                    </td>
                    <td class="w-1px">
                      <Show when={n.gemeente !== null}>
                        <button type="button" class="btn btn-outline-danger btn-sm qa-norm-verwijder" aria-label={`${n.gemeente} verwijderen`} onClick={() => verwijder(n)}><i class="bi bi-trash" aria-hidden="true" /></button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <form class="d-flex flex-wrap gap-2 align-items-end qa-norm-toevoegen" style={{ 'max-width': '42rem' }} onSubmit={toevoegen}>
          <div class="flex-grow-1">
            <label class="form-label" for="norm-gemeente">Gemeente</label>
            <input id="norm-gemeente" class="form-control qa-norm-nieuw-gemeente" list="norm-gemeenten" required value={gemeente()} onInput={(e) => setGemeente(e.currentTarget.value)} />
            <datalist id="norm-gemeenten"><For each={vrij()}>{(g) => <option value={g} />}</For></datalist>
          </div>
          <div style={{ width: '6rem' }}>
            <label class="form-label" for="norm-nieuw-mm">Norm (mm)</label>
            <input id="norm-nieuw-mm" class="form-control qa-norm-nieuw-mm" type="number" min="1" max="100" step="1" required value={mm()} onInput={(e) => setMm(e.currentTarget.value)} />
          </div>
          <button type="submit" class="btn btn-primary qa-norm-voeg-toe">Toevoegen</button>
        </form>
      </Show>
    </>
  );
}

// ---- Materialen ----

interface Materiaal {
  id: number;
  volgorde: number;
  naam: string;
  prijs: number;
}

// Prices are typed in euros ("12,50" or "12.50") and stored in cents.
function centen(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
const euroTekst = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function Materialen() {
  titel('Materialen');
  return (
    <AlleenBeheerder>
      <MaterialenInhoud />
    </AlleenBeheerder>
  );
}

function MaterialenInhoud() {
  const [data, { mutate }] = createResource(() => get<{ materialen: Materiaal[] }>('/api/materialen'));
  const [naam, setNaam] = createSignal('');
  const [prijs, setPrijs] = createSignal('');
  const zet = (m: Materiaal[]) => mutate({ materialen: m });
  const lijst = () => data()!.materialen;

  const toevoegen = async (e: Event) => {
    e.preventDefault();
    const c = centen(prijs());
    if (c === null) return melding('danger', 'Vul een geldige prijs in, bijvoorbeeld 12,50.');
    if (await probeer(async () => zet((await post<{ materialen: Materiaal[] }>('/api/materialen', { naam: naam(), prijs: c })).materialen))) {
      setNaam('');
      setPrijs('');
    }
  };
  const wijzig = async (m: Materiaal, veld: 'naam' | 'prijs', waarde: string) => {
    const nieuw = { naam: m.naam, prijs: m.prijs };
    if (veld === 'naam') nieuw.naam = waarde;
    else {
      const c = centen(waarde);
      if (c === null) return melding('danger', 'Vul een geldige prijs in, bijvoorbeeld 12,50.');
      nieuw.prijs = c;
    }
    if (nieuw.naam === m.naam && nieuw.prijs === m.prijs) return;
    await probeer(async () => zet((await patch<{ materialen: Materiaal[] }>(`/api/materialen/${m.id}`, nieuw)).materialen));
  };
  const verwijder = async (m: Materiaal) => {
    if (!(await bevestig(`${m.naam} verwijderen?`, 'Bestaande dossiers houden hun materialen; alleen nieuwe dossiers krijgen het niet meer.', { ja: 'Verwijderen', gevaar: true }))) return;
    await probeer(async () => zet((await del<{ materialen: Materiaal[] }>(`/api/materialen/${m.id}`)).materialen));
  };
  const verschoven = (l: Materiaal[], van: number, naar: number) => {
    const c = [...l];
    c.splice(naar, 0, ...c.splice(van, 1));
    return c;
  };
  const verplaats = async (van: number, naar: number) => {
    if (naar === van || naar < 0 || naar >= lijst().length) return;
    const oud = lijst();
    zet(verschoven(oud, van, naar));
    const ids = lijst().map((m) => m.id);
    if (!(await probeer(async () => zet((await put<{ materialen: Materiaal[] }>('/api/materialen/volgorde', { ids })).materialen)))) zet(oud);
  };

  // Dragging by the grip shows the new order live and saves it on release. The listeners sit on the document
  // because the dragged row's DOM node moves, which would drop a pointer capture.
  let tbody!: HTMLTableSectionElement;
  const [sleep, setSleep] = createSignal<{ van: number; naar: number } | null>(null);
  const getoond = () => {
    const s = sleep();
    return s ? verschoven(lijst(), s.van, s.naar) : lijst();
  };
  const begin = (e: PointerEvent, i: number) => {
    e.preventDefault();
    setSleep({ van: i, naar: i });
    const beweeg = (ev: PointerEvent) => {
      const rijen = [...tbody.rows];
      const naar = rijen.findIndex((r) => ev.clientY < r.getBoundingClientRect().bottom);
      setSleep({ van: i, naar: naar === -1 ? rijen.length - 1 : naar });
    };
    const los = () => {
      document.removeEventListener('pointermove', beweeg);
      document.removeEventListener('pointerup', los);
      document.removeEventListener('pointercancel', los);
      const s = sleep()!;
      setSleep(null);
      void verplaats(s.van, s.naar);
    };
    document.addEventListener('pointermove', beweeg);
    document.addEventListener('pointerup', los);
    document.addEventListener('pointercancel', los);
  };

  return (
    <>
      <h1>Materialen</h1>
      <p class="text-muted">De standaardlijst waarmee de Materialen-tabel van elk nieuw dossier begint. Wijzigingen gelden niet voor bestaande dossiers.</p>
      <Show when={data()} fallback={<Laden />}>
        <div class="table-responsive">
          <table class="table align-middle qa-materialen" style={{ 'max-width': '42rem' }}>
            <thead>
              <tr>
                <th class="w-1px" />
                <th>Materiaal</th>
                <th style={{ width: '5.25rem' }}>Prijs (€)</th>
                <th class="w-1px" />
              </tr>
            </thead>
            <tbody ref={tbody}>
              <For each={getoond()}>
                {(m, i) => (
                  <tr class="qa-materiaal" classList={{ 'table-active': sleep()?.naar === i() }}>
                    <td class="px-0">
                      <button
                        type="button"
                        class="btn btn-sm btn-link text-secondary sleep-greep qa-greep"
                        aria-label={`${m.naam} verslepen; pijltjestoetsen verplaatsen`}
                        onPointerDown={(e) => begin(e, i())}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          void verplaats(i(), i() + (e.key === 'ArrowUp' ? -1 : 1));
                        }}
                      >
                        <i class="bi bi-grip-vertical" aria-hidden="true" />
                      </button>
                    </td>
                    <td>
                      <input class="form-control form-control-sm qa-materiaal-naam" value={m.naam} onChange={(e) => void wijzig(m, 'naam', e.currentTarget.value)} />
                    </td>
                    <td>
                      <input class="form-control form-control-sm text-end qa-materiaal-prijs" inputmode="decimal" value={euroTekst(m.prijs)} onChange={(e) => void wijzig(m, 'prijs', e.currentTarget.value)} />
                    </td>
                    <td>
                      <button type="button" class="btn btn-sm btn-outline-danger qa-verwijderen" aria-label="Verwijderen" onClick={() => void verwijder(m)}><i class="bi bi-trash3" aria-hidden="true" /></button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <form class="d-flex flex-wrap gap-2 qa-materiaal-toevoegen" style={{ 'max-width': '42rem' }} onSubmit={(e) => void toevoegen(e)}>
          <input class="form-control flex-grow-1 w-auto qa-nieuw-naam" placeholder="Materiaal" required value={naam()} onInput={(e) => setNaam(e.currentTarget.value)} />
          <input class="form-control w-auto qa-nieuw-prijs" placeholder="Prijs, bv. 12,50" inputmode="decimal" required size="10" value={prijs()} onInput={(e) => setPrijs(e.currentTarget.value)} />
          <button type="submit" class="btn btn-primary">Toevoegen</button>
        </form>
      </Show>
    </>
  );
}

// ---- E-mailsjablonen ----

interface Sjabloon {
  key: string;
  naam: string;
  ontvanger: string | null;
  tags: string[];
  verplicht: string[];
  onderwerp: string;
  tekst: string;
}
interface SjablonenData {
  sjablonen: Sjabloon[];
  uitleg: Record<string, string>;
}

export function Sjablonen() {
  titel('E-mailsjablonen');
  return (
    <AlleenBeheerder>
      <SjablonenInhoud />
    </AlleenBeheerder>
  );
}

function SjablonenInhoud() {
  const [data] = createResource(() => get<SjablonenData>('/api/sjablonen'));
  return (
    <>
      <h1>E-mailsjablonen</h1>
      <p class="text-muted">Tags tussen accolades, zoals <code>{'{bewoner}'}</code>, worden bij het versturen ingevuld. Per sjabloon staat welke tags je kunt gebruiken; tags met een * zijn verplicht.</p>
      <Show when={data()} fallback={<Laden />}>
        {(d) => (
          <div class="row row-cols-1 row-cols-md-3 g-2 qa-sjablonen">
            <For each={d().sjablonen}>
              {(s) => (
                <div class="col">
                  <A href={`/beheer/sjablonen/${s.key}`} class={`btn btn-outline-primary w-100 h-100 text-start qa-sjabloon qa-sjabloon-${s.key}`}>
                    <div class="fw-semibold">{s.naam}</div>
                    <div class="small opacity-75">{s.ontvanger === null ? 'Wordt gekopieerd' : `Aan: ${s.ontvanger}`}</div>
                  </A>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </>
  );
}

export function SjabloonPagina() {
  titel('E-mailsjabloon');
  return (
    <AlleenBeheerder>
      <SjabloonInhoud />
    </AlleenBeheerder>
  );
}

function SjabloonInhoud() {
  const params = useParams();
  const [data] = createResource(() => get<SjablonenData>('/api/sjablonen'));
  return (
    <Show when={data()} fallback={<Laden />}>
      {(d) => (
        <Show when={d().sjablonen.find((s) => s.key === params.key)} fallback={<div class="alert alert-warning qa-niet-gevonden">Dit sjabloon bestaat niet.</div>}>
          {(s) => <SjabloonBewerken sjabloon={s()} uitleg={d().uitleg} />}
        </Show>
      )}
    </Show>
  );
}

function SjabloonBewerken(props: { sjabloon: Sjabloon; uitleg: Record<string, string> }) {
  // eslint-disable-next-line solid/reactivity -- the editor starts from the saved text and owns it afterwards
  const s = props.sjabloon;
  titel(s.naam);
  const def = sjabloonDef(s.key);
  const [onderwerp, setOnderwerp] = createSignal(s.onderwerp);
  const [tekst, setTekst] = createSignal(s.tekst);
  const [opgeslagen, setOpgeslagen] = createSignal({ onderwerp: s.onderwerp, tekst: s.tekst });
  const gewijzigd = () => onderwerp() !== opgeslagen().onderwerp || tekst() !== opgeslagen().tekst;
  const problemen = () => probleemTeksten(controleerTags(def, onderwerp(), tekst()));

  const opslaan = async () => {
    const ok = await probeer(() => put(`/api/sjablonen/${s.key}`, { onderwerp: onderwerp(), tekst: tekst() }));
    if (!ok) return;
    setOpgeslagen({ onderwerp: onderwerp(), tekst: tekst() });
    melding(problemen().length ? 'warning' : 'success', problemen().length ? `${s.naam} opgeslagen, maar controleer de tags.` : `${s.naam} opgeslagen.`);
  };

  return (
    <section class={`qa-sjabloon-bewerken qa-sjabloon-${s.key}`}>
      <Kruimels terug={{ href: '/beheer/sjablonen', label: 'E-mailsjablonen' }} huidig={s.naam} />
      <h1>{s.naam}</h1>
      <div class="small text-muted mb-2">{s.ontvanger === null ? 'Wordt gekopieerd, niet gemaild.' : `Aan: ${s.ontvanger}`}</div>
      <div class="small mb-2 qa-tags">
        <For each={s.tags}>
          {(t) => (
            <span class="d-inline-block me-3">
              <code>{`{${t}}`}</code>
              {s.verplicht.includes(t) ? '*' : ''} <span class="text-muted">{props.uitleg[t]}</span>
            </span>
          )}
        </For>
      </div>
      <Show when={s.ontvanger !== null}>
        <label class="form-label fw-semibold mb-1" for="sjabloon-onderwerp">Onderwerp</label>
        <input id="sjabloon-onderwerp" class="form-control mb-2 qa-onderwerp" value={onderwerp()} onInput={(e) => setOnderwerp(e.currentTarget.value)} />
      </Show>
      <label class="form-label fw-semibold mb-1" for="sjabloon-tekst">Tekst</label>
      <textarea id="sjabloon-tekst" class="form-control mb-2 qa-tekst" rows="14" value={tekst()} onInput={(e) => setTekst(e.currentTarget.value)} />
      <Show when={problemen().length}>
        <div class="alert alert-warning py-2 small qa-tag-problemen">
          <For each={problemen()}>{(p) => <div>{p}</div>}</For>
        </div>
      </Show>
      <button type="button" class="btn btn-primary qa-opslaan" disabled={!gewijzigd()} onClick={() => void opslaan()}>Opslaan</button>
    </section>
  );
}

// ---- Feedback ----

interface FeedbackRij {
  id: number;
  created_at: string;
  gebruiker_id: number | null;
  scherm: string;
  tekst: string;
  afgehandeld_at: string | null;
  afgehandeld_by: number | null;
}

export function Feedback() {
  titel('Feedback');
  return (
    <AlleenBeheerder>
      <FeedbackInhoud />
    </AlleenBeheerder>
  );
}

function FeedbackInhoud() {
  const [alle, setAlle] = createSignal(false);
  // A source of `false` would skip the fetch, so the flag goes in as 0/1.
  const [data, { refetch }] = createResource(() => Number(alle()), (a) => get<{ feedback: FeedbackRij[]; gebruikers: Record<string, string> }>(`/api/feedback${query({ alle: a || null })}`));
  const naam = (id: number | null) => {
    if (id === null) return 'Onbekend';
    const n = data()!.gebruikers[id];
    if (n === undefined) throw new Error(`Onbekende gebruiker ${id}`);
    return n;
  };
  const zet = async (f: FeedbackRij, afgehandeld: boolean) => {
    if (await probeer(() => post(`/api/feedback/${f.id}/afgehandeld`, { afgehandeld }))) void refetch();
  };

  return (
    <>
      <h1>Feedback</h1>
      <div class="form-check mb-3">
        <input id="toon-afgehandeld" type="checkbox" class="form-check-input qa-toon-afgehandeld" checked={alle()} onChange={(e) => setAlle(e.currentTarget.checked)} />
        <label for="toon-afgehandeld" class="form-check-label">Toon afgehandelde feedback</label>
      </div>
      <Show when={data()} fallback={<Laden />}>
        {(d) => (
          <Show when={d().feedback.length} fallback={<div class="text-muted qa-geen-feedback">Geen openstaande feedback.</div>}>
            <For each={d().feedback}>
              {(f) => (
                <div class="card card-body mb-2 qa-feedback-item" classList={{ 'text-muted': !!f.afgehandeld_at }}>
                  <div class="d-flex flex-wrap gap-2 small mb-1">
                    <span class="fw-semibold">{naam(f.gebruiker_id)}</span>
                    <span>{datumTijd(f.created_at)}</span>
                    <A href={f.scherm} class="text-truncate">{f.scherm}</A>
                  </div>
                  <div class="pre-wrap mb-2">{f.tekst}</div>
                  <div class="d-flex flex-wrap align-items-center gap-2 small">
                    <Show
                      when={f.afgehandeld_at}
                      fallback={<button type="button" class="btn btn-sm btn-outline-success qa-afhandelen" onClick={() => void zet(f, true)}>Afgehandeld</button>}
                    >
                      {(op) => (
                        <>
                          <span class="text-groen qa-afgehandeld">✅ Afgehandeld op {datumTijd(op())} door {naam(f.afgehandeld_by)}</span>
                          <button type="button" class="btn btn-link btn-sm p-0 qa-heropenen" onClick={() => void zet(f, false)}>Toch niet</button>
                        </>
                      )}
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>
        )}
      </Show>
    </>
  );
}
