// Beheer pages (admin): Materialen, E-mailsjablonen and Feedback.
import { A } from '@solidjs/router';
import { For, Show, createResource, createSignal } from 'solid-js';
import { datumTijd } from '../../shared/datum.ts';
import { controleerTags, probleemTeksten, sjabloonDef } from '../../shared/sjablonen.ts';
import { del, get, patch, post, put, query } from '../api.ts';
import { AlleenBeheerder, Laden, bevestig, melding, probeer, titel } from '../ui.tsx';

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
  const verplaats = async (i: number, richting: -1 | 1) => {
    const ids = lijst().map((m) => m.id);
    [ids[i], ids[i + richting]] = [ids[i + richting], ids[i]];
    await probeer(async () => zet((await put<{ materialen: Materiaal[] }>('/api/materialen/volgorde', { ids })).materialen));
  };

  return (
    <>
      <h1 class="h3">Materialen</h1>
      <p class="text-muted">De standaardlijst waarmee de Materialen-tabel van elk nieuw dossier begint. Wijzigingen gelden niet voor bestaande dossiers.</p>
      <Show when={data()} fallback={<Laden />}>
        <div class="table-responsive">
          <table class="table align-middle qa-materialen" style={{ 'max-width': '42rem' }}>
            <thead>
              <tr>
                <th>Materiaal</th>
                <th style={{ width: '9rem' }}>Prijs (€)</th>
                <th style={{ width: '9rem' }} />
              </tr>
            </thead>
            <tbody>
              <For each={lijst()}>
                {(m, i) => (
                  <tr class="qa-materiaal">
                    <td>
                      <input class="form-control form-control-sm qa-materiaal-naam" value={m.naam} onChange={(e) => void wijzig(m, 'naam', e.currentTarget.value)} />
                    </td>
                    <td>
                      <input class="form-control form-control-sm text-end qa-materiaal-prijs" inputmode="decimal" value={euroTekst(m.prijs)} onChange={(e) => void wijzig(m, 'prijs', e.currentTarget.value)} />
                    </td>
                    <td class="text-nowrap text-end">
                      <button type="button" class="btn btn-sm btn-outline-secondary qa-omhoog" disabled={i() === 0} aria-label="Omhoog" onClick={() => void verplaats(i(), -1)}>↑</button>{' '}
                      <button type="button" class="btn btn-sm btn-outline-secondary qa-omlaag" disabled={i() === lijst().length - 1} aria-label="Omlaag" onClick={() => void verplaats(i(), 1)}>↓</button>{' '}
                      <button type="button" class="btn btn-sm btn-outline-danger qa-verwijderen" aria-label="Verwijderen" onClick={() => void verwijder(m)}>✕</button>
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

export function Sjablonen() {
  titel('E-mailsjablonen');
  return (
    <AlleenBeheerder>
      <SjablonenInhoud />
    </AlleenBeheerder>
  );
}

function SjablonenInhoud() {
  const [data] = createResource(() => get<{ sjablonen: Sjabloon[]; uitleg: Record<string, string> }>('/api/sjablonen'));
  return (
    <>
      <h1 class="h3">E-mailsjablonen</h1>
      <p class="text-muted">Tags tussen accolades, zoals <code>{'{bewoner}'}</code>, worden bij het versturen ingevuld. Per sjabloon staat welke tags je kunt gebruiken; tags met een * zijn verplicht.</p>
      <Show when={data()} fallback={<Laden />}>
        {(d) => <For each={d().sjablonen}>{(s) => <SjabloonKaart sjabloon={s} uitleg={d().uitleg} />}</For>}
      </Show>
    </>
  );
}

function SjabloonKaart(props: { sjabloon: Sjabloon; uitleg: Record<string, string> }) {
  // eslint-disable-next-line solid/reactivity -- the editor starts from the saved text and owns it afterwards
  const s = props.sjabloon;
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
    <section class={`card card-body mb-3 qa-sjabloon qa-sjabloon-${s.key}`}>
      <h2 class="h5 mb-1">{s.naam}</h2>
      <div class="small text-muted mb-2">{s.ontvanger === null ? 'Wordt gekopieerd, niet gemaild.' : `Aan: ${s.ontvanger}`}</div>
      <div class="small mb-2 qa-tags">
        <For each={s.tags}>
          {(t) => (
            <span class="me-3 text-nowrap">
              <code>{`{${t}}`}</code>
              {s.verplicht.includes(t) ? '*' : ''} <span class="text-muted">{props.uitleg[t]}</span>
            </span>
          )}
        </For>
      </div>
      <Show when={s.ontvanger !== null}>
        <label class="form-label fw-semibold mb-1" for={`onderwerp-${s.key}`}>Onderwerp</label>
        <input id={`onderwerp-${s.key}`} class="form-control mb-2 qa-onderwerp" value={onderwerp()} onInput={(e) => setOnderwerp(e.currentTarget.value)} />
      </Show>
      <label class="form-label fw-semibold mb-1" for={`tekst-${s.key}`}>Tekst</label>
      <textarea id={`tekst-${s.key}`} class="form-control mb-2 qa-tekst" rows="10" value={tekst()} onInput={(e) => setTekst(e.currentTarget.value)} />
      <Show when={problemen().length}>
        <div class="alert alert-warning py-2 small qa-tag-problemen">
          <For each={problemen()}>{(p) => <div>{p}</div>}</For>
        </div>
      </Show>
      <div>
        <button type="button" class="btn btn-primary qa-opslaan" disabled={!gewijzigd()} onClick={() => void opslaan()}>Opslaan</button>
      </div>
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
      <h1 class="h3">Feedback</h1>
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
