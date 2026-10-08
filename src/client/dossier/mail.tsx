// Edit-and-send pop-up for one e-mail template, prefilled with the template's tags already filled in for this dossier.
import { For, Show, createResource, createSignal, untrack } from 'solid-js';
import { datum } from '../../shared/datum.ts';
import { TAG_UITLEG, ontbrekendeWaarden, sjabloonDef } from '../../shared/sjablonen.ts';
import type { Dossier, Verzending } from '../../shared/types.ts';
import { ApiFout, get, post } from '../api.ts';
import { Laden, Modal, bevestig, melding } from '../ui.tsx';
import { useDossier } from './staat.ts';

interface MailData {
  sjabloon: { key: string; naam: string };
  aan: string;
  cc: string;
  onderwerp: string;
  tekst: string;
  waarden: Record<string, string>;
  bijlage: string | null;
  eerder: Verzending[];
}

export function MailModal(props: { sjabloon: string; onSluit: () => void; onVerstuurd?: (d: Dossier) => void }) {
  const s = useDossier();
  const def = sjabloonDef(untrack(() => props.sjabloon));
  const [data] = createResource(() => get<MailData>(`/api/dossiers/${s.id}/mail/${props.sjabloon}`));
  const [aan, setAan] = createSignal<string | null>(null);
  const [onderwerp, setOnderwerp] = createSignal<string | null>(null);
  const [tekst, setTekst] = createSignal<string | null>(null);
  const [bezig, setBezig] = createSignal(false);
  const [fout, setFout] = createSignal<string | null>(null);

  const waarde = (eigen: string | null, standaard: string) => (eigen === null ? standaard : eigen);
  const problemen = () => {
    const m = data()!;
    return ontbrekendeWaarden(def, m.waarden, waarde(onderwerp(), m.onderwerp), waarde(tekst(), m.tekst)).map((t) => `De ${TAG_UITLEG[t]} ontbreekt, maar is nodig.`);
  };

  const verstuur = async (handmatig: boolean) => {
    const m = data()!;
    if (
      handmatig &&
      !(await bevestig(
        'Zelf verstuurd?',
        <>
          <p>De app verstuurt deze e-mail <strong>niet</strong>.</p>
          <p class="mb-0">Je bevestigt dat je hem zelf al hebt verstuurd, bijvoorbeeld vanuit je eigen mailprogramma. Het dossier noteert hem dan als handmatig verstuurd.</p>
        </>,
        { ja: 'Ja, zelf verstuurd' },
      ))
    )
      return;
    if (problemen().length && !(await bevestig('Weet je het zeker?', <ul class="mb-0"><For each={problemen()}>{(p) => <li>{p}</li>}</For></ul>, { ja: handmatig ? 'Toch markeren' : 'Toch versturen' }))) return;
    setBezig(true);
    setFout(null);
    try {
      const r = await post<{ dossier: Dossier }>(`/api/dossiers/${s.id}/mail/${props.sjabloon}`, { aan: waarde(aan(), m.aan), onderwerp: waarde(onderwerp(), m.onderwerp), tekst: waarde(tekst(), m.tekst), handmatig });
      s.vervang(r.dossier);
      melding('success', handmatig ? 'Gemarkeerd als handmatig verstuurd.' : 'E-mail verstuurd.');
      props.onVerstuurd?.(r.dossier);
      props.onSluit();
    } catch (e) {
      if (!(e instanceof ApiFout)) throw e;
      setFout(e.message);
      // A failed delivery is still logged on the dossier.
      if (e.status === 502) await s.herlaad();
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      titel={def.naam}
      groot
      class="qa-mail"
      onSluit={() => props.onSluit()}
      voet={
        // "Handmatig verstuurd" sends nothing, so it sits on its own line below Versturen, at the far side, and asks first.
        <>
          <div class="d-flex justify-content-end gap-2 w-100">
            <button type="button" class="btn btn-outline-secondary" onClick={() => props.onSluit()}>Annuleren</button>
            <button type="button" class="btn btn-primary qa-mail-versturen" disabled={bezig() || !data()} onClick={() => void verstuur(false)}>{bezig() ? 'Bezig...' : 'Versturen'}</button>
          </div>
          <div class="w-100">
            <button type="button" class="btn btn-link btn-sm p-0 qa-mail-handmatig" disabled={bezig() || !data()} onClick={() => void verstuur(true)}>Handmatig verstuurd...</button>
          </div>
        </>
      }
    >
      <Show when={data()} fallback={<Laden />}>
        {(m) => (
          <>
            <Show when={m().eerder.length}>
              <div class="alert alert-danger qa-mail-eerder">
                Deze e-mail is al eerder verstuurd: <For each={m().eerder}>{(v, i) => <>{i() ? ', ' : ''}{datum(v.created_at)} aan {v.aan}{v.mislukt_at ? ' (mislukt)' : v.handmatig ? ' (handmatig)' : ''}</>}</For>.
              </div>
            </Show>
            <Show when={fout()}>
              <div class="alert alert-danger qa-mail-fout">{fout()}</div>
            </Show>
            <div class="mb-2">
              <label class="form-label mb-0 small fw-semibold" for="mail-aan">Aan</label>
              <input id="mail-aan" type="email" class="form-control qa-mail-aan" value={waarde(aan(), m().aan)} onInput={(e) => setAan(e.currentTarget.value)} />
              <div class="form-text">Een kopie gaat naar jou ({m().cc}); antwoorden komen bij jou binnen.</div>
            </div>
            <div class="mb-2">
              <label class="form-label mb-0 small fw-semibold" for="mail-onderwerp">Onderwerp</label>
              <input id="mail-onderwerp" class="form-control qa-mail-onderwerp" value={waarde(onderwerp(), m().onderwerp)} onInput={(e) => setOnderwerp(e.currentTarget.value)} />
            </div>
            <div class="mb-2">
              <label class="form-label mb-0 small fw-semibold" for="mail-tekst">Tekst</label>
              <textarea id="mail-tekst" class="form-control qa-mail-tekst" rows="12" value={waarde(tekst(), m().tekst)} onInput={(e) => setTekst(e.currentTarget.value)} />
            </div>
            <Show when={problemen().length}>
              <div class="small text-warning mb-2 qa-mail-tagfout">
                <For each={problemen()}>{(p) => <div>{p}</div>}</For>
              </div>
            </Show>
            <Show when={m().bijlage}>
              <div class="small mt-2 qa-mail-bijlage">📎 {m().bijlage}</div>
            </Show>
          </>
        )}
      </Show>
    </Modal>
  );
}
