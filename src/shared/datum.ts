export const DAG_MS = 864e5;

// Local-time strings (afspraak, uitvoering gepland, uitstel tot) are read in the runtime's timezone, Europe/Amsterdam on the server.
export function lokaal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) throw new Error(`Ongeldige datum: ${s}`);
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export function dagenSinds(sinds: Date | string, nu: Date): number {
  const t = typeof sinds === 'string' ? new Date(sinds) : sinds;
  return Math.floor((nu.getTime() - t.getTime()) / DAG_MS);
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function alsDate(s: string | Date): Date {
  if (s instanceof Date) return s;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s) ? lokaal(s) : new Date(s);
}

export function datum(s: string | Date): string {
  const d = alsDate(s);
  return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

export function tijd(s: string | Date): string {
  const d = alsDate(s);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function datumTijd(s: string | Date): string {
  return `${datum(s)} ${tijd(s)}`;
}

export function kortDatum(s: string | Date): string {
  const d = alsDate(s);
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

export function isoDatum(s: string | Date): string {
  const d = alsDate(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function euro(cent: number): string {
  return `€ ${(cent / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
