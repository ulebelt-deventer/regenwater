// "+ Nieuwe gebruiker" and "Bewerken" form. From a dossier's assign dropdown the rol is fixed to Klusser.
import { Show, createSignal } from 'solid-js';
import type { Gebruiker, Rol } from '../shared/types.ts';
import { ApiFout, patch, post } from './api.ts';
import { Modal } from './ui.tsx';

export function GebruikerForm(props: { gebruiker?: Gebruiker; vasteRol?: Rol; onSluit: () => void; onOpgeslagen: (g: Gebruiker) => void }) {
  // eslint-disable-next-line solid/reactivity -- the form starts from the user as it was when opened
  const g = props.gebruiker;
  const [naam, setNaam] = createSignal(g ? g.naam : '');
  const [email, setEmail] = createSignal(g ? g.email : '');
  const [telefoon, setTelefoon] = createSignal(g && g.telefoon ? g.telefoon : '');
  // eslint-disable-next-line solid/reactivity
  const [rol, setRol] = createSignal<Rol>(props.vasteRol ?? (g ? g.rol : 'klusser'));
  const [fout, setFout] = createSignal<string | null>(null);
  const [bezig, setBezig] = createSignal(false);

  const opslaan = async (e: Event) => {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      const inhoud = { naam: naam(), email: email(), telefoon: telefoon(), rol: rol() };
      const r = g ? await patch<{ gebruiker: Gebruiker }>(`/api/gebruikers/${g.id}`, inhoud) : await post<{ gebruiker: Gebruiker }>('/api/gebruikers', inhoud);
      props.onOpgeslagen(r.gebruiker);
    } catch (err) {
      if (!(err instanceof ApiFout)) throw err;
      setFout(err.message);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      titel={g ? `${g.naam} bewerken` : props.vasteRol === 'klusser' ? 'Nieuwe klusser' : 'Nieuwe gebruiker'}
      onSluit={() => props.onSluit()}
      class="qa-gebruiker-form"
      voet={
        <>
          <button type="button" class="btn btn-outline-secondary" onClick={() => props.onSluit()}>Annuleren</button>
          <button type="submit" form="gebruiker-form" class="btn btn-primary qa-gebruiker-opslaan" disabled={bezig()}>Opslaan</button>
        </>
      }
    >
      <form id="gebruiker-form" onSubmit={(e) => void opslaan(e)}>
        <Show when={fout()}>
          <div class="alert alert-danger qa-gebruiker-fout">{fout()}</div>
        </Show>
        <div class="mb-2">
          <label class="form-label mb-0 small fw-semibold" for="g-naam">Naam</label>
          <input id="g-naam" class="form-control qa-gebruiker-naam" required value={naam()} onInput={(e) => setNaam(e.currentTarget.value)} />
        </div>
        <div class="mb-2">
          <label class="form-label mb-0 small fw-semibold" for="g-email">E-mail</label>
          <input id="g-email" type="email" class="form-control qa-gebruiker-email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </div>
        <div class="mb-2">
          <label class="form-label mb-0 small fw-semibold" for="g-tel">Telefoon (optioneel)</label>
          <input id="g-tel" type="tel" class="form-control qa-gebruiker-telefoon" value={telefoon()} onInput={(e) => setTelefoon(e.currentTarget.value)} />
          <div class="form-text">Alleen zichtbaar voor beheerders.</div>
        </div>
        <Show when={!props.vasteRol}>
          <div class="mb-2">
            <div class="form-label mb-0 small fw-semibold">Rol</div>
            <div class="form-check form-check-inline">
              <input class="form-check-input qa-rol-beheerder" type="radio" name="g-rol" id="g-rol-b" checked={rol() === 'beheerder'} onChange={() => setRol('beheerder')} />
              <label class="form-check-label" for="g-rol-b">Beheerder</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input qa-rol-klusser" type="radio" name="g-rol" id="g-rol-k" checked={rol() === 'klusser'} onChange={() => setRol('klusser')} />
              <label class="form-check-label" for="g-rol-k">Klusser</label>
            </div>
          </div>
        </Show>
        <Show when={!g}>
          <p class="small text-muted mb-0">Er wordt niets automatisch verstuurd. De nieuwe gebruiker logt in met dit e-mailadres.</p>
        </Show>
      </form>
    </Modal>
  );
}
