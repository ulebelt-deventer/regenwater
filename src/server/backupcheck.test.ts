import { describe, expect, it } from 'vitest';
import { controleerBackup } from './backupcheck.ts';
import { type DB, openDb } from './db.ts';

function metEvent(createdAt: string | null): DB {
  const db = openDb(':memory:');
  if (createdAt) db.prepare("INSERT INTO audit (created_at, updated_at, type) VALUES (?, ?, 'test')").run(createdAt, createdAt);
  return db;
}

describe('controleerBackup', () => {
  it('accepts a restore whose newest audit event is at most an hour behind live', () => {
    expect(controleerBackup(metEvent('2026-03-02T10:30:00.000Z'), metEvent('2026-03-02T09:45:00.000Z'))).toEqual([]);
  });

  it('reports a restore that is more than an hour behind live', () => {
    expect(controleerBackup(metEvent('2026-03-02T10:30:00.000Z'), metEvent('2026-03-01T10:30:00.000Z'))).toEqual(['de backup loopt achter: nieuwste event 2026-03-01T10:30:00.000Z, live 2026-03-02T10:30:00.000Z']);
  });

  it('reports a restore without audit events when live has them', () => {
    expect(controleerBackup(metEvent('2026-03-02T10:30:00.000Z'), metEvent(null))).toEqual(['de backup heeft geen audit-events, live wel (nieuwste 2026-03-02T10:30:00.000Z)']);
  });

  it('accepts two empty databases', () => {
    expect(controleerBackup(metEvent(null), metEvent(null))).toEqual([]);
  });
});
