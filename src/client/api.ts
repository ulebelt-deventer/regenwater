// Every server error is `{ fout }`; ApiFout carries it with the status so callers can tell a rejection from a dropped connection.
export class ApiFout extends Error {
  status: number;
  constructor(status: number, bericht: string) {
    super(bericht);
    this.status = status;
  }
}

export function isNetwerkFout(e: unknown): boolean {
  return !(e instanceof ApiFout) || e.status >= 500;
}

export async function api<T = any>(methode: string, pad: string, inhoud?: unknown): Promise<T> {
  const init: RequestInit = { method: methode, headers: {} };
  if (inhoud instanceof Blob) {
    init.body = inhoud;
    (init.headers as Record<string, string>)['content-type'] = inhoud.type || 'application/octet-stream';
  } else if (inhoud !== undefined) {
    init.body = JSON.stringify(inhoud);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res = await fetch(pad, init);
  const tekst = await res.text();
  const json = tekst ? JSON.parse(tekst) : {};
  if (!res.ok) {
    if (res.status === 401 && !isOpenbaar(location.pathname)) naarInloggen();
    throw new ApiFout(res.status, typeof json.fout === 'string' ? json.fout : `Fout ${res.status}`);
  }
  return json as T;
}

// Pages readable without logging in.
const OPENBAAR = ['/inloggen', '/privacy'];
export const isOpenbaar = (pad: string) => OPENBAAR.some((p) => pad.startsWith(p));

export const TERUG_SLEUTEL = 'terugNaInloggen';

// Remembers the page a logged-out visitor opened, for one return after login, and carries a klusser email link's ?email= along to prefill.
function naarInloggen(): void {
  const params = new URLSearchParams(location.search);
  const email = params.get('email');
  params.delete('email');
  if (location.pathname !== '/') localStorage.setItem(TERUG_SLEUTEL, location.pathname + (params.size ? `?${params}` : ''));
  location.assign(`/inloggen${query({ email })}`);
}

export const get = <T = any>(pad: string) => api<T>('GET', pad);
export const post = <T = any>(pad: string, inhoud: unknown = {}) => api<T>('POST', pad, inhoud);
export const patch = <T = any>(pad: string, inhoud: unknown) => api<T>('PATCH', pad, inhoud);
export const put = <T = any>(pad: string, inhoud: unknown) => api<T>('PUT', pad, inhoud);
export const del = <T = any>(pad: string) => api<T>('DELETE', pad);

export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
