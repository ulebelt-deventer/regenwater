import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Gebruiker } from '../shared/types.ts';
import type { Config } from './config.ts';
import type { DB } from './db.ts';
import type { Klok } from './klok.ts';
import type { Mailer } from './mail.ts';

export interface PdfPrinter {
  print(html: string): Promise<Buffer>;
}

// Everything a request handler needs from the outside world; tests swap in fakes.
export interface Ctx {
  db: DB;
  klok: Klok;
  mailer: Mailer;
  config: Config;
  haal: typeof fetch; // outbound HTTP to PDOK and BRO
  pdf: PdfPrinter;
  verzoek: (regel: string) => void; // the request log, see verzoeklog.ts
}

export interface Env {
  Variables: {
    ik: Gebruiker; // who the request acts as: the impersonated klusser while "Inloggen als" is on
    actor: Gebruiker; // the person actually logged in
    sessieId: number;
  };
}

export type C = Context<Env>;

export function fout(status: ContentfulStatusCode, bericht: string): never {
  throw new HTTPException(status, { message: bericht });
}

export interface Actor {
  id: number | null;
  als: number | null;
}

export function actorVan(c: C): Actor {
  const ik = c.get('ik');
  const actor = c.get('actor');
  return { id: actor.id, als: ik.id === actor.id ? null : ik.id };
}

export async function body<T>(c: C): Promise<T> {
  let b: unknown;
  try {
    b = await c.req.json();
  } catch {
    fout(400, 'Ongeldig verzoek');
  }
  if (typeof b !== 'object' || b === null) fout(400, 'Ongeldig verzoek');
  return b as T;
}

export function idParam(c: C, naam = 'id'): number {
  const n = Number(c.req.param(naam));
  if (!Number.isInteger(n) || n <= 0) fout(404, 'Niet gevonden');
  return n;
}
