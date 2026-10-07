import { AUDIT_MERGE_MIN } from '../shared/constants.ts';
import type { Json } from '../shared/types.ts';
import type { Actor, Ctx } from './context.ts';

export type Wijzigingen = Record<string, [Json, Json]>;

export interface AuditRij {
  id: number;
  created_at: string;
  updated_at: string;
  actor_id: number | null;
  impersonated_user_id: number | null;
  dossier_id: number | null;
  type: string;
  payload: string;
}

export function audit(ctx: Ctx, actor: Actor, dossierId: number | null, type: string, payload: Record<string, Json> = {}): void {
  const nu = ctx.klok.iso();
  ctx.db
    .prepare('INSERT INTO audit (created_at, updated_at, actor_id, impersonated_user_id, dossier_id, type, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nu, nu, actor.id, actor.als, dossierId, type, JSON.stringify(payload));
}

const gelijk = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

// Field changes merge into the dossier's last event when it is an edit by the same person (and same impersonation) within AUDIT_MERGE_MIN of that event's first save, keeping each field's first old value.
export function auditWijzigingen(ctx: Ctx, actor: Actor, dossierId: number, wijzigingen: Wijzigingen): void {
  const laatste = ctx.db.prepare('SELECT * FROM audit WHERE dossier_id = ? ORDER BY id DESC LIMIT 1').get(dossierId) as AuditRij | undefined;
  const nu = ctx.klok.nu();
  const samenvoegen =
    laatste &&
    laatste.type === 'dossier_gewijzigd' &&
    laatste.actor_id === actor.id &&
    laatste.impersonated_user_id === actor.als &&
    nu.getTime() - new Date(laatste.created_at).getTime() < AUDIT_MERGE_MIN * 6e4;
  if (!samenvoegen) {
    audit(ctx, actor, dossierId, 'dossier_gewijzigd', { changes: wijzigingen });
    return;
  }
  const changes = (JSON.parse(laatste.payload) as { changes: Wijzigingen }).changes;
  for (const [key, [oud, nieuw]] of Object.entries(wijzigingen)) {
    const eerste = key in changes ? changes[key][0] : oud;
    if (gelijk(eerste, nieuw)) delete changes[key];
    else changes[key] = [eerste, nieuw];
  }
  if (Object.keys(changes).length === 0) {
    ctx.db.prepare('DELETE FROM audit WHERE id = ?').run(laatste.id);
    return;
  }
  ctx.db.prepare('UPDATE audit SET payload = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ changes }), nu.toISOString(), laatste.id);
}
