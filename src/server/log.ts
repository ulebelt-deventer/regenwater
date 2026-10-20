// Anything at warning level or above pings the Healthchecks /fail endpoint, at most once an hour.
let healthcheckUrl: string | null = null;
let laatsteFailPing = 0;

export function stelHealthcheckIn(url: string | null): void {
  healthcheckUrl = url;
}

function ping(pad: string): void {
  if (!healthcheckUrl) return;
  fetch(healthcheckUrl + pad, { method: 'POST' }).catch((e: unknown) => console.error(`healthcheck ping mislukt: ${String(e)}`));
}

// journald files every line as info unless it starts with a syslog prefix like <4>; it sets JOURNAL_STREAM for a unit's output.
// Each line of a multi-line message (a stack trace) needs its own prefix.
function metNiveau(niveau: number, tekst: string): string {
  return process.env.JOURNAL_STREAM ? tekst.replace(/^/gm, `<${niveau}>`) : tekst;
}

export const log = {
  info(bericht: string): void {
    console.log(bericht);
  },
  warn(bericht: string): void {
    console.warn(metNiveau(4, `WARN ${bericht}`));
    meldFout();
  },
  error(bericht: string, fout?: unknown): void {
    console.error(metNiveau(3, `ERROR ${bericht} ${fout instanceof Error ? (fout.stack ?? fout.message) : (fout ?? '')}`));
    meldFout();
  },
};

function meldFout(): void {
  const nu = Date.now();
  if (nu - laatsteFailPing < 36e5) return;
  laatsteFailPing = nu;
  ping('/fail');
}

export function dagelijksePing(): void {
  ping('');
}
