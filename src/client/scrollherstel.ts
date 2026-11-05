// A reload keeps your place on a long form. The browser's own restore can't: it runs while the page is still short, before the session and dossier have loaded.
const SLEUTEL = 'regenton.scroll';
// Long enough for a slow connection in a backyard; any input of the user's ends it sooner.
const WACHT_MS = 10_000;

const pad = () => location.pathname + location.search;

// Re-applied on every growth until the deadline, not just once it fits: photos arriving later would otherwise push the content down.
function herstel(y: number): void {
  const zet = () => window.scrollTo({ top: y, behavior: 'instant' });
  const app = document.getElementById('app')!;
  const groei = new ResizeObserver(() => {
    if (document.documentElement.scrollHeight - window.innerHeight >= y) zet();
  });
  const invoer = ['pointerdown', 'wheel', 'keydown'];
  const stop = () => {
    clearTimeout(deadline);
    groei.disconnect();
    for (const e of invoer) window.removeEventListener(e, stop);
  };
  // A page that is shorter now ends as far down as it goes.
  const deadline = setTimeout(() => {
    zet();
    stop();
  }, WACHT_MS);
  groei.observe(app);
  for (const e of invoer) window.addEventListener(e, stop, { passive: true });
}

export function startScrollHerstel(): void {
  const bewaard = sessionStorage.getItem(SLEUTEL);
  window.addEventListener('pagehide', () => sessionStorage.setItem(SLEUTEL, JSON.stringify({ pad: pad(), y: window.scrollY })));
  const [navigatie] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (navigatie.type !== 'reload' || !bewaard) return;
  // A phone can discard a page without pagehide, leaving the position of an earlier page.
  const vorige = JSON.parse(bewaard) as { pad: string; y: number };
  if (vorige.pad === pad() && vorige.y > 0) herstel(vorige.y);
}
