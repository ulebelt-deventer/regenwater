import { Show, createSignal } from 'solid-js';
import { PROEF_BEWAAR_DAGEN } from '../../shared/constants.ts';
import { ApiFout, post } from '../api.ts';
import { omgeving } from '../sessie.ts';
import { titel } from '../ui.tsx';

// Sign-up for a proefomgeving (src/server/proef.ts), the link on the conference QR code.
export function Proberen() {
  titel('Proberen');
  const [naam, setNaam] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [code, setCode] = createSignal('');
  const [verstuurd, setVerstuurd] = createSignal(false);
  const [fout, setFout] = createSignal<string | null>(null);
  const [bezig, setBezig] = createSignal(false);

  const doe = async (fn: () => Promise<void>) => {
    setFout(null);
    setBezig(true);
    try {
      await fn();
    } catch (e) {
      setFout(e instanceof ApiFout ? e.message : 'Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setBezig(false);
    }
  };
  const aanmelden = (e: Event) => {
    e.preventDefault();
    void doe(async () => {
      await post('/api/proberen', { naam: naam().trim(), email: email().trim() });
      setVerstuurd(true);
    });
  };
  const metCode = (e: Event) => {
    e.preventDefault();
    void doe(async () => {
      await post('/api/auth/code', { email: email().trim(), code: code().trim() });
      // A full load, so no page keeps state from a previous login on this browser.
      location.assign('/');
    });
  };

  return (
    <div class="mx-auto py-4" style={{ 'max-width': '32rem' }}>
      <h1 class="mb-3">Probeer de app</h1>
      <Show when={omgeving() === 'test'} fallback={<p class="qa-proberen-niet">Proberen kan alleen op de testomgeving.</p>}>
        <p>Je krijgt je eigen proefomgeving: een kopie van de app met voorbeelddossiers en voorbeeldklussers, waarin jij beheerder bent. Niemand anders ziet wat je erin doet.</p>
        <p>E-mails die de app normaal aan een bewoner, klusser of corporatie stuurt, komen in deze proefomgeving bij jou terecht.</p>
        <p class="text-muted small">We bewaren je naam, e-mailadres en proefomgeving tot {PROEF_BEWAAR_DAGEN} dagen na je laatste bezoek, en verwijderen ze dan.</p>
        <Show when={fout()}>
          <div class="alert alert-danger qa-proberen-fout">{fout()}</div>
        </Show>
        <Show
          when={verstuurd()}
          fallback={
            <form onSubmit={aanmelden} class="qa-proberen-form">
              <label class="form-label" for="naam">Je naam</label>
              <input id="naam" class="form-control mb-3 qa-proberen-naam" autocomplete="name" maxlength="100" required value={naam()} onInput={(e) => setNaam(e.currentTarget.value)} />
              <label class="form-label" for="email">Je e-mailadres</label>
              <input id="email" type="email" class="form-control mb-3 qa-proberen-email" autocomplete="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
              <button type="submit" class="btn btn-primary w-100 qa-proberen-maak" disabled={bezig()}>Maak mijn proefomgeving</button>
            </form>
          }
        >
          <div class="alert alert-success qa-proberen-verstuurd">
            Je proefomgeving staat klaar. We hebben een e-mail gestuurd naar <strong>{email()}</strong> met een code en een link. Op je telefoon: typ hier de code in. Op een computer: klik op de link in de e-mail.
          </div>
          <form onSubmit={metCode} class="qa-proberen-code-form">
            <label class="form-label" for="code">Code</label>
            <input
              id="code"
              ref={(el) => queueMicrotask(() => el.focus())}
              class="form-control form-control-lg mb-3 text-center qa-proberen-code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              required
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
            <button type="submit" class="btn btn-primary w-100 qa-proberen-inloggen" disabled={bezig()}>Inloggen</button>
          </form>
        </Show>
      </Show>
    </div>
  );
}
