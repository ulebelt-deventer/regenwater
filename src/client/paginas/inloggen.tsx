import { useNavigate } from '@solidjs/router';
import { Show, createSignal, onMount } from 'solid-js';
import { ApiFout, post } from '../api.ts';
import { laadSessie, sessie } from '../sessie.ts';
import { titel } from '../ui.tsx';

const startpagina = () => (sessie()!.ik.rol === 'beheerder' ? '/' : '/dossiers');

async function naInloggen(navigate: (p: string, o?: { replace: boolean }) => void): Promise<void> {
  await laadSessie();
  navigate(startpagina(), { replace: true });
}

export function Inloggen() {
  titel('Inloggen');
  const navigate = useNavigate();
  const [email, setEmail] = createSignal('');
  const [code, setCode] = createSignal('');
  const [verstuurd, setVerstuurd] = createSignal(false);
  const [fout, setFout] = createSignal<string | null>(null);
  const [bezig, setBezig] = createSignal(false);

  onMount(() => {
    if (sessie()) navigate(startpagina(), { replace: true });
  });

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
  const vraagAan = (e: Event) => {
    e.preventDefault();
    void doe(async () => {
      await post('/api/auth/request', { email: email().trim() });
      setVerstuurd(true);
    });
  };
  const metCode = (e: Event) => {
    e.preventDefault();
    void doe(async () => {
      await post('/api/auth/code', { email: email().trim(), code: code().trim() });
      await naInloggen(navigate);
    });
  };

  return (
    <div class="mx-auto py-4" style={{ 'max-width': '26rem' }}>
      <h1 class="h3 mb-3">Inloggen</h1>
      <Show when={fout()}>
        <div class="alert alert-danger qa-login-fout">{fout()}</div>
      </Show>
      <Show
        when={verstuurd()}
        fallback={
          <form onSubmit={vraagAan} class="qa-login-email-form">
            <label class="form-label" for="email">Je e-mailadres</label>
            <input id="email" type="email" class="form-control mb-3 qa-login-email" autocomplete="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
            <button type="submit" class="btn btn-primary w-100 qa-login-aanvragen" disabled={bezig()}>Stuur mij een inlogcode</button>
          </form>
        }
      >
        <div class="alert alert-success qa-login-verstuurd">
          We hebben een e-mail gestuurd naar <strong>{email()}</strong> met een code en een link. Op je telefoon: typ hier de code in. Op een computer: klik op de link in de e-mail.
        </div>
        <form onSubmit={metCode} class="qa-login-code-form">
          <label class="form-label" for="code">Code</label>
          <input
            id="code"
            class="form-control form-control-lg mb-3 text-center qa-login-code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
          />
          <button type="submit" class="btn btn-primary w-100 qa-login-inloggen" disabled={bezig()}>Inloggen</button>
        </form>
        <button type="button" class="btn btn-link px-0 mt-2" onClick={() => setVerstuurd(false)}>Ander e-mailadres of nieuwe code</button>
      </Show>
    </div>
  );
}

// The emailed link only shows a button: mail scanners open every link, which must not use up the one-use token.
export function InloggenLink() {
  titel('Inloggen');
  const navigate = useNavigate();
  const [fout, setFout] = createSignal<string | null>(null);
  const token = location.hash.slice(1);
  const inloggen = async () => {
    try {
      await post('/api/auth/link', { token });
      await naInloggen(navigate);
    } catch (e) {
      setFout(e instanceof ApiFout ? e.message : 'Er ging iets mis. Probeer het opnieuw.');
    }
  };
  return (
    <div class="d-flex flex-column align-items-center justify-content-center py-5 gap-3">
      <Show when={fout()}>
        <div class="alert alert-danger qa-login-fout">
          {fout()} <a href="/inloggen">Nieuwe code aanvragen</a>
        </div>
      </Show>
      <button type="button" class="btn btn-primary btn-lg px-5 qa-link-inloggen" onClick={() => void inloggen()}>Inloggen</button>
    </div>
  );
}
