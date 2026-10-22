// One line per HTTP request, for troubleshooting and security review: method, path with query, status, duration, who, and IP. Never the body: it holds login codes and residents' personal data, and the audit trail already records every change.
import type { MiddlewareHandler } from 'hono';
import { ip } from './auth.ts';
import type { Ctx, Env } from './context.ts';

// The login link carries its token in the query; the line must not hold a working login.
const GEHEIM = ['token', 'code'];

// Static files (the built JS, CSS, fonts, icons) are noise: the page load before them is logged.
const isStatisch = (pad: string) => !pad.startsWith('/api/') && !pad.startsWith('/docs/') && /\.[a-z0-9]+$/i.test(pad);

export function verzoekLog(ctx: Ctx): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (isStatisch(c.req.path)) return next();
    const begin = performance.now();
    await next();
    const url = new URL(c.req.url);
    for (const k of GEHEIM) if (url.searchParams.has(k)) url.searchParams.set(k, '***');
    const ms = Math.round(performance.now() - begin);
    const actor = c.var.actor as Env['Variables']['actor'] | undefined;
    const ik = c.var.ik as Env['Variables']['ik'] | undefined;
    const wie = actor ? ` gebruiker=${actor.id}${ik && ik.id !== actor.id ? ` als=${ik.id}` : ''}` : '';
    ctx.verzoek(`${c.req.method} ${url.pathname}${url.search} ${c.res.status} ${ms}ms${wie} ip=${ip(c)}`);
  };
}
