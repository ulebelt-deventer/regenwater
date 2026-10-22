// An open page, or an installed app brought back from the background, keeps running the old code after a deploy until it reloads.
import { createSignal } from 'solid-js';

const INTERVAL_MS = 15 * 60_000;
// Shared by every tab on the device. A timestamp rather than a 15-minute setInterval: a phone freezes timers in the background, so a resumed app checks right away.
const SLEUTEL = 'regenton.versieGecontroleerd';

const [nieuw, setNieuw] = createSignal(false);
export const nieuweVersie = nieuw;
// Dismissing means staying on this version: the page stops checking until it reloads.
let weggeklikt = false;
export const verbergNieuweVersie = () => {
  weggeklikt = true;
  setNieuw(false);
};

async function controleer(eigen: string): Promise<void> {
  if (weggeklikt) return;
  if (Date.now() - Number(localStorage.getItem(SLEUTEL)) < INTERVAL_MS) return;
  localStorage.setItem(SLEUTEL, String(Date.now()));
  // The page's own build in the query is only for the request log, so it shows who still runs an old one. Offline, logged out, or the server restarting mid-deploy: the next check asks again.
  const r = await fetch(`/api/versie?versie=${encodeURIComponent(eigen)}`, { cache: 'no-store' }).catch(() => null);
  if (!r?.ok) return;
  const { versie } = (await r.json()) as { versie: string };
  if (versie !== eigen) setNieuw(true);
}

// Development serves the client from Vite, which has no /api/versie.
export function startVersieControle(): void {
  if (!import.meta.env.PROD) return;
  const eigen: string = import.meta.env.VITE_APP_VERSIE;
  void controleer(eigen);
  setInterval(() => void controleer(eigen), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void controleer(eigen);
  });
}
