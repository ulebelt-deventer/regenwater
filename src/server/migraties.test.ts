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

    db.exec(MIGRATIES[versie]);

    expect(db.prepare('SELECT inschrijving_afgerond_at, inschrijving_afgerond_by FROM dossiers WHERE id = 7').get()).toEqual({ inschrijving_afgerond_at: T, inschrijving_afgerond_by: 1 });
    expect(db.prepare('SELECT stap FROM uitstellen ORDER BY id').pluck().all()).toEqual(['inschrijving', 'bezoeker']);
    expect(db.prepare('SELECT payload FROM audit ORDER BY id').pluck().all().map((p) => JSON.parse(p as string))).toEqual([
      { mijlpaal: 'inschrijving_afgerond', aan: true },
      { mijlpaal: 'bezoek_afgerond', aan: true },
      { stap: 'inschrijving', tot: '2026-03-25', notitie: 'vakantie' },
    ]);
  });
});

describe('Aandacht uitstellen -> ijskast', () => {
  it('keeps the latest running snooze of each open dossier in the ijskast, ends the rest, and converts the audit entries', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('CREATE TABLE ijskast'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    const dossier = db.prepare('INSERT INTO dossiers (id, created_at, created_by, gesloten_at) VALUES (?, ?, 1, ?)');
    dossier.run(1, T, null);
    dossier.run(2, T, null);
    dossier.run(3, T, T);
    const uitstel = db.prepare("INSERT INTO uitstellen (dossier_id, stap, tot, notitie, created_at, created_by) VALUES (?, 'bezoeker', ?, ?, ?, 1)");
    uitstel.run(1, '2099-01-01', 'eerste', T);
    uitstel.run(1, '2099-02-01', 'tweede', T);
    uitstel.run(2, '2020-01-01', 'verlopen', T);
    uitstel.run(3, '2099-01-01', 'gesloten', T);
    db.prepare("INSERT INTO audit (created_at, updated_at, actor_id, dossier_id, type, payload) VALUES (?, ?, 1, 1, 'uitgesteld', ?)").run(T, T, JSON.stringify({ stap: 'bezoeker', tot: '2099-01-01', notitie: 'eerste' }));

    db.exec(MIGRATIES[versie]);

    expect(db.prepare('SELECT dossier_id, tot, reden, eind_at IS NULL AS open FROM ijskast ORDER BY id').all()).toEqual([
      { dossier_id: 1, tot: '2099-01-01', reden: 'eerste', open: 0 },
      { dossier_id: 1, tot: '2099-02-01', reden: 'tweede', open: 1 },
      { dossier_id: 2, tot: '2020-01-01', reden: 'verlopen', open: 0 },
      { dossier_id: 3, tot: '2099-01-01', reden: 'gesloten', open: 0 },
    ]);
    expect(db.prepare('SELECT type, payload FROM audit').get()).toEqual({ type: 'ijskast_in', payload: JSON.stringify({ tot: '2099-01-01', reden: 'eerste' }) });
    expect(db.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'uitstellen'").pluck().get()).toBe(0);
  });
});

describe('the soort of a melding', () => {
  it('names existing meldingen from their titel, and none is clicked away', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('ADD COLUMN weggeklikt_at'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by) VALUES (7, ?, 1)').run(T);
    const melding = db.prepare('INSERT INTO notificaties (gebruiker_id, dossier_id, titel, created_at) VALUES (1, 7, ?, ?)');
    for (const titel of ['Klaar voor controle (Kees)', 'Werk opgeleverd (Kees)', 'Uit de ijskast: Bewoner verbouwt', 'E-mail niet afgeleverd aan a@example.org']) melding.run(titel, T);

    db.exec(MIGRATIES[versie]);

    expect(db.prepare('SELECT soort, weggeklikt_at FROM notificaties ORDER BY id').all()).toEqual([
      { soort: 'overdracht', weggeklikt_at: null },
      { soort: 'overdracht', weggeklikt_at: null },
      { soort: 'ijskast', weggeklikt_at: null },
      { soort: 'mail_mislukt', weggeklikt_at: null },
    ]);
  });
});

describe('the Terras -> Steen rename', () => {
  it('renames annotation types, steen fields and photo slots in dossiers, photos and audit, and leaves other text alone', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('"type":"terras"'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    const vlak = (type: string) => ({ id: 'v1', type, p: [[0, 0], [1, 0], [1, 1]] });
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by, data) VALUES (7, ?, 1, ?)').run(T, JSON.stringify({ kaart_annotaties: [vlak('terras'), vlak('tuin')], 'terras.v1.m2': 12, 'fotos.terras.v1': ['f1'], bijzonderheden: 'terras achter' }));
    db.prepare("INSERT INTO fotos (id, dossier_id, slot, breedte, hoogte, annotaties, created_at, created_by) VALUES ('f1', 7, 'terras.v1', 4, 3, ?, ?, 1)").run(JSON.stringify([vlak('terras')]), T);
    db.prepare("INSERT INTO audit (created_at, updated_at, actor_id, dossier_id, type, payload) VALUES (?, ?, 1, 7, 'dossier_gewijzigd', ?)").run(T, T, JSON.stringify({ changes: { kaart_annotaties: [null, [vlak('terras')]], 'terras.v1.m2': [null, 12] } }));

    migreer(db);

    expect(JSON.parse(db.prepare('SELECT data FROM dossiers WHERE id = 7').pluck().get() as string)).toEqual({ kaart_annotaties: [vlak('steen'), vlak('tuin')], 'steen.v1.m2': 12, 'fotos.steen.v1': ['f1'], bijzonderheden: 'terras achter' });
    expect(db.prepare("SELECT slot, annotaties FROM fotos WHERE id = 'f1'").get()).toEqual({ slot: 'steen.v1', annotaties: JSON.stringify([vlak('steen')]) });
    expect(JSON.parse(db.prepare('SELECT payload FROM audit').pluck().get() as string)).toEqual({ changes: { kaart_annotaties: [null, [vlak('steen')]], 'steen.v1.m2': [null, 12] } });
  });
});

describe('the Afspraken as bulleted lines', () => {
  it('turns ticked options into their labels followed by the details, and leaves dossiers without afspraken alone', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('$.bewoner_doet_details'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    const dossier = db.prepare('INSERT INTO dossiers (id, created_at, created_by, data) VALUES (?, ?, 1, ?)');
    dossier.run(7, T, JSON.stringify({ bewoner_doet: ['buren', 'opruimen'], bewoner_doet_details: 'Voor 1 mei\nBel de buurvrouw', ulebelt_doet: ['materialen'], wensen: 'Twee tonnen' }));
    dossier.run(8, T, JSON.stringify({ ulebelt_doet_details: 'Tegels ophalen' }));
    dossier.run(9, T, JSON.stringify({ wensen: 'Eén ton' }));

    migreer(db);

    const data = (id: number) => JSON.parse(db.prepare('SELECT data FROM dossiers WHERE id = ?').pluck().get(id) as string);
    expect(data(7)).toEqual({ bewoner_doet: 'Overleggen met de buren (bij gedeelde regenpijp)\nTuin opruimen op plek regenton\nVoor 1 mei\nBel de buurvrouw', ulebelt_doet: 'Materialen regelen', wensen: 'Twee tonnen' });
    expect(data(8)).toEqual({ ulebelt_doet: 'Tegels ophalen' });
    expect(data(9)).toEqual({ wensen: 'Eén ton' });
  });
});

describe('the voorstel as bulleted lines', () => {
  it('joins the voorstel lines in order with the Werkzaamheden text after them, drops the old keys, and keeps other values as they were', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes("'$.werkzaamheden'"));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    const dossier = db.prepare('INSERT INTO dossiers (id, created_at, created_by, data) VALUES (?, ?, 1, ?)');
    const overig = { wensen: 'Twee tonnen', 'fotos.kaart': ['f1'], kaart_annotaties: [{ id: 'a1', type: 'dak', p: [[0, 0], [1, 1]] }], 'dak.a1.verdeling': { p1: 100 }, aan: true, uit: false, 'materiaal.m1.aantal': 2 };
    dossier.run(7, T, JSON.stringify({ ...overig, voorstel: ['b2', 'a1', 'c3'], 'voorstel.a1.tekst': 'Wadi graven', 'voorstel.b2.tekst': ' Regenton plaatsen ', 'voorstel.c3.tekst': '', werkzaamheden: 'Bocht aanbrengen\nBuis verbinden' }));
    dossier.run(8, T, JSON.stringify({ werkzaamheden: 'Tegels leggen' }));
    dossier.run(9, T, JSON.stringify({ voorstel: ['a1'], 'voorstel.a1.tekst': '  ', werkzaamheden: '' }));
    dossier.run(10, T, JSON.stringify({ wensen: 'Eén ton' }));
    dossier.run(11, T, JSON.stringify({ voorstel: ['a1'], 'voorstel.a1.tekst': '- Wadi "graven" 🌧️', werkzaamheden: '\r\n- Bocht\r\n\r\n\t• Buis  \n* Grind\n  1. Worteldoek  \n-10 cm uitgraven\n' }));

    migreer(db);

    const data = (id: number) => JSON.parse(db.prepare('SELECT data FROM dossiers WHERE id = ?').pluck().get(id) as string);
    expect(data(7)).toEqual({ ...overig, voorstel: 'Regenton plaatsen\nWadi graven\nBocht aanbrengen\nBuis verbinden' });
    expect(data(8)).toEqual({ voorstel: 'Tegels leggen' });
    expect(data(9)).toEqual({});
    expect(data(10)).toEqual({ wensen: 'Eén ton' });
    expect(data(11)).toEqual({ voorstel: 'Wadi "graven" 🌧️\nBocht\nBuis\nGrind\n1. Worteldoek\n-10 cm uitgraven' });
  });

  it('turns the line changes in the audit into one voorstel change, and drops id list changes and rows left without changes', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes("'$.werkzaamheden'"));
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by) VALUES (7, ?, 1)').run(T);
    const audit = db.prepare('INSERT INTO audit (created_at, updated_at, actor_id, dossier_id, type, payload) VALUES (?, ?, 1, 7, ?, ?)');
    const wijziging = (changes: Record<string, [unknown, unknown]>) => audit.run(T, T, 'dossier_gewijzigd', JSON.stringify({ changes }));
    wijziging({ beoordeling: [null, 'uitvoerbaar'], voorstel: [null, ['a1', 'b2']], 'voorstel.a1.tekst': [null, 'Ton'], 'voorstel.b2.tekst': ['', 'Wadi'], wensen: ['x', 'y'] });
    wijziging({ 'voorstel.a1.tekst': ['Ton', 'Ton en wadi'], voorstel: [['a1', 'b2'], ['a1']], 'voorstel.b2.tekst': ['Wadi', null] });
    wijziging({ voorstel: [['a1'], ['a1', 'c3']] });
    wijziging({ 'voorstel.c3.tekst': ['', null] });
    wijziging({ wensen: ['y', 'z'] });
    audit.run(T, T, 'mijlpaal', JSON.stringify({ mijlpaal: 'bezoek_afgerond', aan: true }));

    migreer(db);

    expect(db.prepare('SELECT type, payload FROM audit ORDER BY id').all().map((r) => ({ ...(r as object), payload: JSON.parse((r as { payload: string }).payload) }))).toEqual([
      { type: 'dossier_gewijzigd', payload: { changes: { beoordeling: [null, 'uitvoerbaar'], voorstel: [null, 'Ton\nWadi'], wensen: ['x', 'y'] } } },
      { type: 'dossier_gewijzigd', payload: { changes: { voorstel: ['Ton\nWadi', 'Ton en wadi'] } } },
      { type: 'dossier_gewijzigd', payload: { changes: { wensen: ['y', 'z'] } } },
      { type: 'mijlpaal', payload: { mijlpaal: 'bezoek_afgerond', aan: true } },
    ]);
  });
});

describe('the Salland Wonen -> SallandWonen rename', () => {
  it('renames the woningeigenaar in dossiers and field changes, and leaves other values and sent mail alone', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes("'SallandWonen'"));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    const dossier = db.prepare('INSERT INTO dossiers (id, created_at, created_by, data) VALUES (?, ?, 1, ?)');
    dossier.run(7, T, JSON.stringify({ woningeigenaar: 'Salland Wonen', wensen: 'Ton bij Salland Wonen' }));
    dossier.run(8, T, JSON.stringify({ woningeigenaar: 'Rentree' }));
    dossier.run(9, T, JSON.stringify({ woningeigenaar: 'anders', woningeigenaar_anders: 'Salland Wonen' }));
    const audit = db.prepare('INSERT INTO audit (created_at, updated_at, actor_id, dossier_id, type, payload) VALUES (?, ?, 1, 7, ?, ?)');
    audit.run(T, T, 'dossier_gewijzigd', JSON.stringify({ changes: { woningeigenaar: [null, 'Salland Wonen'], woningtype: [null, 'anders'] } }));
    audit.run(T, T, 'dossier_gewijzigd', JSON.stringify({ changes: { woningeigenaar: ['Salland Wonen', 'Rentree'] } }));
    audit.run(T, T, 'dossier_gewijzigd', JSON.stringify({ changes: { wensen: ['Salland Wonen', 'Ton'] } }));
    audit.run(T, T, 'email_verstuurd', JSON.stringify({ sjabloon: 'plan_corporatie', tekst: 'Beste Salland Wonen,' }));

    migreer(db);

    expect(db.prepare('SELECT data FROM dossiers ORDER BY id').pluck().all().map((p) => JSON.parse(p as string))).toEqual([
      { woningeigenaar: 'SallandWonen', wensen: 'Ton bij Salland Wonen' },
      { woningeigenaar: 'Rentree' },
      { woningeigenaar: 'anders', woningeigenaar_anders: 'Salland Wonen' },
    ]);
    expect(db.prepare('SELECT payload FROM audit ORDER BY id').pluck().all().map((p) => JSON.parse(p as string))).toEqual([
      { changes: { woningeigenaar: [null, 'SallandWonen'], woningtype: [null, 'anders'] } },
      { changes: { woningeigenaar: ['SallandWonen', 'Rentree'] } },
      { changes: { wensen: ['Salland Wonen', 'Ton'] } },
      { sjabloon: 'plan_corporatie', tekst: 'Beste Salland Wonen,' },
    ]);
  });
});

describe('the normafvoeren table', () => {
  it('seeds the standaard row at 20 mm and fixes that value on dossiers past their Bezoek, leaving the others open', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('CREATE TABLE normafvoeren'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by) VALUES (1, ?, 1)').run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by, bezoek_afgerond_at, bezoek_afgerond_by) VALUES (2, ?, 1, ?, 1)').run(T, T);
    db.prepare("INSERT INTO dossiers (id, created_at, created_by, gesloten_at, gesloten_by, gesloten_reden) VALUES (3, ?, 1, ?, 1, 'anders')").run(T, T);

    migreer(db);

    expect(db.prepare('SELECT gemeente, mm FROM normafvoeren').all()).toEqual([{ gemeente: null, mm: 20 }]);
    expect(db.prepare('SELECT id, normafvoer_mm, normafvoer_gemeente FROM dossiers ORDER BY id').all()).toEqual([
      { id: 1, normafvoer_mm: null, normafvoer_gemeente: null },
      { id: 2, normafvoer_mm: 20, normafvoer_gemeente: null },
      { id: 3, normafvoer_mm: 20, normafvoer_gemeente: null },
    ]);
    expect(db.prepare('SELECT normafvoer_at IS NOT NULL AS vast FROM dossiers ORDER BY id').pluck().all()).toEqual([0, 1, 1]);
  });
});

describe('the dossier eigenaar', () => {
  it('starts as the beheerder who created the dossier', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes('ADD COLUMN eigenaar_id'));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (2, 'Bea', 'bea@example.org', 'beheerder', ?)").run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by) VALUES (1, ?, 1)').run(T);
    db.prepare('INSERT INTO dossiers (id, created_at, created_by) VALUES (2, ?, 2)').run(T);

    migreer(db);

    expect(db.prepare('SELECT id, eigenaar_id FROM dossiers ORDER BY id').all()).toEqual([{ id: 1, eigenaar_id: 1 }, { id: 2, eigenaar_id: 2 }]);
  });
});

describe('the agreed klussendienst_kosten', () => {
  it('sets € 50 per afgekoppelde regenpijp on huur and koop dossiers past their Bezoek, and leaves earlier dossiers and set amounts alone', () => {
    const versie = MIGRATIES.findIndex((m) => m.includes("'$.klussendienst_kosten'"));
    expect(versie).toBeGreaterThan(0);
    const db = dbTot(versie);
    const T = '2026-03-02T10:00:00.000Z';
    db.prepare("INSERT INTO gebruikers (id, naam, email, rol, created_at) VALUES (1, 'Anna', 'anna@example.org', 'beheerder', ?)").run(T);
    const pijpen = {
      kaart_annotaties: [{ id: 'r1', type: 'regenpijp' }, { id: 'r2', type: 'regenpijp' }, { id: 'r3', type: 'regenpijp' }, { id: 'd1', type: 'dak' }],
      'regenpijp.r1.afkoppelen': 'ja', 'regenpijp.r2.afkoppelen': 'ja', 'regenpijp.r3.afkoppelen': 'nee', 'dak.d1.afkoppelen': 'ja',
    };
    const dossier = db.prepare('INSERT INTO dossiers (id, created_at, created_by, huur_koop, bezoek_afgerond_at, data) VALUES (?, ?, 1, ?, ?, ?)');
    dossier.run(1, T, 'koop', T, JSON.stringify(pijpen));
    dossier.run(2, T, 'koop', T, '{}');
    dossier.run(3, T, 'huur', T, JSON.stringify(pijpen));
    dossier.run(4, T, 'koop', null, JSON.stringify(pijpen));
    dossier.run(5, T, 'koop', T, JSON.stringify({ ...pijpen, klussendienst_kosten: 12345 }));

    migreer(db);

    const kosten = db.prepare("SELECT json_extract(data, '$.klussendienst_kosten') FROM dossiers ORDER BY id").pluck().all();
    expect(kosten).toEqual([10000, 0, 10000, null, 12345]);
  });
});
