import Database from 'better-sqlite3';
import { STANDAARD_MATERIALEN } from '../shared/constants.ts';
import { SJABLONEN } from '../shared/sjablonen.ts';
import { MIGRATIES } from './migraties.ts';

export type DB = Database.Database;

export function openDb(pad: string): DB {
  const db = new Database(pad);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migreer(db);
  return db;
}

export function migreer(db: DB): void {
  const versie = db.pragma('user_version', { simple: true }) as number;
  for (let i = versie; i < MIGRATIES.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIES[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  zaai(db);
}

// Templates and the default materials are seeded once; admins edit them from then on. New templates added in code are seeded too.
function zaai(db: DB): void {
  const sjabloon = db.prepare('INSERT OR IGNORE INTO sjablonen (key, onderwerp, tekst) VALUES (?, ?, ?)');
  for (const s of SJABLONEN) sjabloon.run(s.key, s.onderwerp, s.tekst);
  const aantal = (db.prepare('SELECT COUNT(*) AS n FROM materialen').get() as { n: number }).n;
  if (aantal === 0) {
    const m = db.prepare('INSERT INTO materialen (volgorde, naam, prijs) VALUES (?, ?, ?)');
    STANDAARD_MATERIALEN.forEach(([naam, prijs], i) => m.run(i, naam, prijs));
  }
}
