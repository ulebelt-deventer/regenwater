import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migreer } from './db.ts';
import { MIGRATIES } from './migraties.ts';

// Brings a fresh database up to (not including) migration `tot`.
function dbTot(tot: number): Database.Database {
  const db = new Database(':memory:');
  for (let i = 0; i < tot; i++) db.exec(MIGRATIES[i]);
  db.pragma(`user_version = ${tot}`);
  return db;
}

describe('the Intake -> Inschrijving rename', () => {
  it('moves the milestone columns, postponements and audit payloads over, and leaves the other steps alone', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('RENAME COLUMN intake_afgerond_at'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by, intake_afgerond_at, intake_afgerond_by) VALUES (7, ?, 1, ?, 1)').run(T, T);
    const uitstel = db.prepare("INSERT INTO uitstellen (dossier_id, stap, tot, notitie, created_at, created_by) VALUES (7, ?, '2026-03-25', 'vakantie', ?, 1)");
    uitstel.run('intake', T);
    uitstel.run('bezoeker', T);
    const audit = db.prepare('INSERT INTO audit (created_at, updated_at, actor_id, dossier_id, type, payload) VALUES (?, ?, 1, 7, ?, ?)');
    audit.run(T, T, 'mijlpaal', JSON.stringify({ mijlpaal: 'intake_afgerond', aan: true }));
    audit.run(T, T, 'mijlpaal', JSON.stringify({ mijlpaal: 'bezoek_afgerond', aan: true }));
    audit.run(T, T, 'uitgesteld', JSON.stringify({ stap: 'intake', tot: '2026-03-25', notitie: 'vakantie' }));

    migreer(db);

    expect(db.prepare('SELECT inschrijving_afgerond_at, inschrijving_afgerond_by FROM dossiers WHERE id = 7').get()).toEqual({ inschrijving_afgerond_at: T, inschrijving_afgerond_by: 1 });
    expect(db.prepare('SELECT stap FROM uitstellen ORDER BY id').pluck().all()).toEqual(['inschrijving', 'bezoeker']);
    expect(db.prepare('SELECT payload FROM audit ORDER BY id').pluck().all().map((p) => JSON.parse(p as string))).toEqual([
      { mijlpaal: 'inschrijving_afgerond', aan: true },
      { mijlpaal: 'bezoek_afgerond', aan: true },
      { stap: 'inschrijving', tot: '2026-03-25', notitie: 'vakantie' },
    ]);
  });
});
