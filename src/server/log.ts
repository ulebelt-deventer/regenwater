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

export const log = {
  info(bericht: string): void {
    console.log(bericht);
  },
  warn(bericht: string): void {
    console.warn(`WARN ${bericht}`);
    meldFout();
  },
  error(bericht: string, fout?: unknown): void {
    console.error(`ERROR ${bericht}`, fout instanceof Error ? (fout.stack ?? fout.message) : (fout ?? ''));
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
