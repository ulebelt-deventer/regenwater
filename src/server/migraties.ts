// Append-only: each entry runs once, in order, tracked by PRAGMA user_version.
export const MIGRATIES: string[] = [
  `
  CREATE TABLE gebruikers (
    id INTEGER PRIMARY KEY,
    naam TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    telefoon TEXT,
    rol TEXT NOT NULL CHECK (rol IN ('beheerder', 'klusser')),
    created_at TEXT NOT NULL,
    archived_at TEXT,
    last_active_at TEXT
  );

  CREATE TABLE sessies (
    id INTEGER PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id),
    impersonated_user_id INTEGER REFERENCES gebruikers(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE login_codes (
    id INTEGER PRIMARY KEY,
    gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id),
    code_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    foute_pogingen INTEGER NOT NULL DEFAULT 0,
    gebruikt_at TEXT,
    vervallen_at TEXT
  );

  CREATE TABLE login_pogingen (
    id INTEGER PRIMARY KEY,
    soort TEXT NOT NULL CHECK (soort IN ('aanvraag', 'code', 'mail')),
    email TEXT,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX login_pogingen_tijd ON login_pogingen(created_at);

  CREATE TABLE dossiers (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id),
    straat TEXT, huisnummer INTEGER, huisletter TEXT, toevoeging TEXT, postcode TEXT, plaats TEXT, gemeente TEXT,
    adres_json TEXT,
    huur_koop TEXT CHECK (huur_koop IN ('huur', 'koop')),
    bezoeker_id INTEGER REFERENCES gebruikers(id),
    uitvoerder_id INTEGER REFERENCES gebruikers(id),
    afspraak TEXT,
    uitvoering_gepland TEXT,
    bezoeker_toegewezen_at TEXT, bezoeker_toegewezen_by INTEGER,
    bezoek_afgerond_at TEXT, bezoek_afgerond_by INTEGER,
    klaar_voor_controle_at TEXT, klaar_voor_controle_by INTEGER,
    corporatie_akkoord_at TEXT, corporatie_akkoord_by INTEGER,
    klussendienst_gekozen_at TEXT, klussendienst_gekozen_by INTEGER,
    uitvoerder_toegewezen_at TEXT, uitvoerder_toegewezen_by INTEGER,
    werk_opgeleverd_at TEXT, werk_opgeleverd_by INTEGER,
    gesloten_at TEXT, gesloten_by INTEGER, gesloten_reden TEXT, gesloten_toelichting TEXT,
    plan_gewijzigd_at TEXT,
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX dossiers_adres ON dossiers(postcode, huisnummer);

  CREATE TABLE verzendingen (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    sjabloon TEXT NOT NULL,
    ontvanger TEXT NOT NULL,
    aan TEXT NOT NULL,
    cc TEXT,
    onderwerp TEXT NOT NULL,
    tekst TEXT NOT NULL,
    handmatig INTEGER NOT NULL DEFAULT 0,
    mislukt_at TEXT,
    mislukt_reden TEXT,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id)
  );
  CREATE INDEX verzendingen_dossier ON verzendingen(dossier_id);

  CREATE TABLE uitstellen (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    stap TEXT NOT NULL,
    tot TEXT NOT NULL,
    notitie TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id)
  );

  CREATE TABLE plan_acks (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    ontvanger TEXT NOT NULL,
    notitie TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id)
  );

  CREATE TABLE fotos (
    id TEXT PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    slot TEXT NOT NULL,
    breedte INTEGER NOT NULL,
    hoogte INTEGER NOT NULL,
    m_per_px REAL,
    annotaties TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id),
    verwijderd_at TEXT
  );
  CREATE INDEX fotos_dossier ON fotos(dossier_id);

  CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    actor_id INTEGER REFERENCES gebruikers(id),
    impersonated_user_id INTEGER REFERENCES gebruikers(id),
    dossier_id INTEGER,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX audit_dossier ON audit(dossier_id, id);
  CREATE INDEX audit_actor ON audit(actor_id, id);

  CREATE TABLE sjablonen (
    key TEXT PRIMARY KEY,
    onderwerp TEXT NOT NULL,
    tekst TEXT NOT NULL
  );

  CREATE TABLE materialen (
    id INTEGER PRIMARY KEY,
    volgorde INTEGER NOT NULL,
    naam TEXT NOT NULL,
    prijs INTEGER NOT NULL
  );

  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    gebruiker_id INTEGER REFERENCES gebruikers(id),
    scherm TEXT NOT NULL,
    tekst TEXT NOT NULL,
    afgehandeld_at TEXT,
    afgehandeld_by INTEGER REFERENCES gebruikers(id)
  );
  `,
  `ALTER TABLE dossiers ADD COLUMN extra_json TEXT NOT NULL DEFAULT '{}';`,
  // Existing dossiers count as intake complete from their first successful subsidiemail, as the step rule had it.
  `
  ALTER TABLE dossiers ADD COLUMN intake_afgerond_at TEXT;
  ALTER TABLE dossiers ADD COLUMN intake_afgerond_by INTEGER;
  UPDATE dossiers SET
    intake_afgerond_at = (SELECT v.created_at FROM verzendingen v WHERE v.dossier_id = dossiers.id AND v.mislukt_at IS NULL AND v.sjabloon IN ('subsidie_huur', 'subsidie_koop', 'subsidie_niet') ORDER BY v.id LIMIT 1),
    intake_afgerond_by = (SELECT v.created_by FROM verzendingen v WHERE v.dossier_id = dossiers.id AND v.mislukt_at IS NULL AND v.sjabloon IN ('subsidie_huur', 'subsidie_koop', 'subsidie_niet') ORDER BY v.id LIMIT 1);
  `,
  // The first step is called Inschrijving, also in stored step and milestone keys.
  `
  ALTER TABLE dossiers RENAME COLUMN intake_afgerond_at TO inschrijving_afgerond_at;
  ALTER TABLE dossiers RENAME COLUMN intake_afgerond_by TO inschrijving_afgerond_by;
  UPDATE uitstellen SET stap = 'inschrijving' WHERE stap = 'intake';
  UPDATE audit SET payload = json_set(payload, '$.stap', 'inschrijving') WHERE type = 'uitgesteld' AND json_extract(payload, '$.stap') = 'intake';
  UPDATE audit SET payload = json_set(payload, '$.mijlpaal', 'inschrijving_afgerond') WHERE type = 'mijlpaal' AND json_extract(payload, '$.mijlpaal') = 'intake_afgerond';
  `,
  // Terras is called Steen: annotation type, steen.<id>.* fields and photo slots, also in audit history.
  `
  UPDATE dossiers SET data = replace(replace(replace(data, '"type":"terras"', '"type":"steen"'), '"terras.', '"steen.'), '"fotos.terras.', '"fotos.steen.') WHERE data LIKE '%terras%';
  UPDATE audit SET payload = replace(replace(replace(payload, '"type":"terras"', '"type":"steen"'), '"terras.', '"steen.'), '"fotos.terras.', '"fotos.steen.') WHERE payload LIKE '%terras%';
  UPDATE fotos SET annotaties = replace(annotaties, '"type":"terras"', '"type":"steen"') WHERE annotaties LIKE '%terras%';
  UPDATE fotos SET slot = 'steen' || substr(slot, 7) WHERE slot LIKE 'terras.%';
  `,
  // The Afspraken become bulleted lines: each ticked option's label, then the "Verdere details", in one text. group_concat skips the details when there are none.
  `
  UPDATE dossiers SET data = json_remove(json_set(data, '$.bewoner_doet', (
    SELECT group_concat(r, char(10) ORDER BY n) FROM (
      SELECT j.key AS n, CASE j.value WHEN 'opruimen' THEN 'Tuin opruimen op plek regenton' WHEN 'steen' THEN 'Steen van 60x60 regelen voor onder regenton' WHEN 'buren' THEN 'Overleggen met de buren (bij gedeelde regenpijp)' END AS r FROM json_each(dossiers.data, '$.bewoner_doet') j
      UNION ALL SELECT 1000, json_extract(dossiers.data, '$.bewoner_doet_details')
    )
  )), '$.bewoner_doet_details') WHERE json_type(data, '$.bewoner_doet') IS NOT NULL OR json_type(data, '$.bewoner_doet_details') IS NOT NULL;
  UPDATE dossiers SET data = json_remove(json_set(data, '$.ulebelt_doet', (
    SELECT group_concat(r, char(10) ORDER BY n) FROM (
      SELECT j.key AS n, CASE j.value WHEN 'plan' THEN 'Plan van Aanpak schrijven' WHEN 'toestemming' THEN 'Toestemming aan woningcorporatie vragen' WHEN 'klussendienst' THEN 'De Klussendienst vragen om afspraak met bewoner te maken' WHEN 'materialen' THEN 'Materialen regelen' END AS r FROM json_each(dossiers.data, '$.ulebelt_doet') j
      UNION ALL SELECT 1000, json_extract(dossiers.data, '$.ulebelt_doet_details')
    )
  )), '$.ulebelt_doet_details') WHERE json_type(data, '$.ulebelt_doet') IS NOT NULL OR json_type(data, '$.ulebelt_doet_details') IS NOT NULL;
  `,
  // The newest NIEUWS datum this beheerder has seen on "Wat is er nieuw".
  `ALTER TABLE gebruikers ADD COLUMN nieuws_gezien TEXT;`,
  // On a rotated photo: the photo as first uploaded, whose row and file stay (verwijderd_at set) for diagnosis. Rotations in between are deleted.
  `ALTER TABLE fotos ADD COLUMN origineel_id TEXT;`,
  // The voorstel becomes bulleted lines: each voorstel.<id>.tekst in list order, then the dropped Werkzaamheden text, split into lines cleaned like opsommingRegels plus a typed "- " or "* " marker.
  // The rebuild drops the per-line keys (a removed row's key is already gone); json() keeps nested values and booleans JSON.
  // In the audit, a row's line changes become one voorstel change of the changed lines; the id list changes go, and a row left without changes too.
  `
  CREATE TEMP TABLE voorstel_bron AS SELECT id, (
    SELECT group_concat(t, char(10) ORDER BY n) FROM (
      SELECT j.key AS n, json_extract(dossiers.data, '$."voorstel.' || j.value || '.tekst"') AS t FROM json_each(dossiers.data, '$.voorstel') j WHERE json_type(dossiers.data, '$.voorstel') = 'array'
      UNION ALL SELECT 1000000, json_extract(dossiers.data, '$.werkzaamheden')
    )
  ) AS tekst FROM dossiers WHERE json_type(data, '$.voorstel') = 'array' OR json_type(data, '$.werkzaamheden') IS NOT NULL;
  CREATE TEMP TABLE voorstel_regels AS WITH RECURSIVE s(id, n, regel, rest) AS (
    SELECT id, 0, NULL, replace(replace(coalesce(tekst, ''), char(13) || char(10), char(10)), char(13), char(10)) || char(10) FROM voorstel_bron
    UNION ALL SELECT id, n + 1, substr(rest, 1, instr(rest, char(10)) - 1), substr(rest, instr(rest, char(10)) + 1) FROM s WHERE rest <> ''
  ) SELECT id, n, trim(regel, ' ' || char(9)) AS regel FROM s WHERE n > 0;
  UPDATE voorstel_regels SET regel = trim(substr(regel, 2), ' ' || char(9)) WHERE substr(regel, 1, 1) = '•' OR substr(regel, 1, 2) IN ('- ', '* ');
  UPDATE dossiers SET data = json_set(data, '$.voorstel', (SELECT group_concat(regel, char(10) ORDER BY n) FROM voorstel_regels r WHERE r.id = dossiers.id AND r.regel <> ''))
    WHERE id IN (SELECT id FROM voorstel_bron);
  DROP TABLE voorstel_bron;
  DROP TABLE voorstel_regels;
  UPDATE dossiers SET data = (
    SELECT json_group_object(j.key, CASE j.type WHEN 'true' THEN json('true') WHEN 'false' THEN json('false') WHEN 'object' THEN json(j.value) WHEN 'array' THEN json(j.value) ELSE j.value END)
    FROM json_each(dossiers.data) j
    WHERE j.key NOT LIKE 'voorstel.%' AND j.key <> 'werkzaamheden' AND NOT (j.key = 'voorstel' AND j.type = 'null')
  ) WHERE data LIKE '%"voorstel%' OR data LIKE '%"werkzaamheden"%';
  UPDATE audit SET payload = json_set(payload, '$.changes', (
    SELECT json_group_object(k, json(v)) FROM (
      SELECT j.id AS n, j.key AS k, j.value AS v FROM json_each(audit.payload, '$.changes') j WHERE j.key <> 'voorstel' AND j.key NOT LIKE 'voorstel.%'
      UNION ALL SELECT n, 'voorstel', json_array(oud, nieuw) FROM (
        SELECT min(j.id) AS n,
          group_concat(CASE WHEN json_extract(j.value, '$[0]') <> '' THEN json_extract(j.value, '$[0]') END, char(10) ORDER BY j.id) AS oud,
          group_concat(CASE WHEN json_extract(j.value, '$[1]') <> '' THEN json_extract(j.value, '$[1]') END, char(10) ORDER BY j.id) AS nieuw
        FROM json_each(audit.payload, '$.changes') j WHERE j.key LIKE 'voorstel.%.tekst'
      ) WHERE n IS NOT NULL AND oud IS NOT nieuw
      ORDER BY n
    )
  )) WHERE type = 'dossier_gewijzigd' AND payload LIKE '%"voorstel%';
  DELETE FROM audit WHERE type = 'dossier_gewijzigd' AND json_extract(payload, '$.changes') = '{}';
  `,
  `
  UPDATE dossiers SET data = json_set(data, '$.woningeigenaar', 'SallandWonen') WHERE json_extract(data, '$.woningeigenaar') = 'Salland Wonen';
  UPDATE audit SET payload = json_set(payload, '$.changes.woningeigenaar[0]', 'SallandWonen') WHERE type = 'dossier_gewijzigd' AND json_extract(payload, '$.changes.woningeigenaar[0]') = 'Salland Wonen';
  UPDATE audit SET payload = json_set(payload, '$.changes.woningeigenaar[1]', 'SallandWonen') WHERE type = 'dossier_gewijzigd' AND json_extract(payload, '$.changes.woningeigenaar[1]') = 'Salland Wonen';
  `,
  `
  CREATE TABLE normafvoeren (
    id INTEGER PRIMARY KEY,
    gemeente TEXT,
    mm INTEGER NOT NULL,
    gecontroleerd_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX normafvoeren_gemeente ON normafvoeren (COALESCE(gemeente, '') COLLATE NOCASE);
  INSERT INTO normafvoeren (gemeente, mm, gecontroleerd_at) VALUES (NULL, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  ALTER TABLE dossiers ADD COLUMN normafvoer_mm INTEGER;
  ALTER TABLE dossiers ADD COLUMN normafvoer_gemeente TEXT;
  ALTER TABLE dossiers ADD COLUMN normafvoer_reden TEXT;
  ALTER TABLE dossiers ADD COLUMN normafvoer_at TEXT;
  UPDATE dossiers SET normafvoer_mm = 20, normafvoer_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE bezoek_afgerond_at IS NOT NULL OR gesloten_at IS NOT NULL;
  `,
  `
  CREATE TABLE verborgen_meldingen (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    sleutel TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id),
    UNIQUE (dossier_id, sleutel)
  );
  `,
  // The beheerder who gets this dossier's meldingen. SQLite can't add a NOT NULL reference column, so laadDossier enforces it.
  `
  ALTER TABLE dossiers ADD COLUMN eigenaar_id INTEGER REFERENCES gebruikers(id);
  UPDATE dossiers SET eigenaar_id = created_by;
  `,
  // The ijskast replaces Aandacht uitstellen. eind_at: taken out early, the dossier closed, or the eigenaar mailed on the day. Each uitstel becomes an ijskast; per open dossier only its newest one still running stays open, so its eigenaar is mailed on its date.
  `
  CREATE TABLE ijskast (
    id INTEGER PRIMARY KEY,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    tot TEXT NOT NULL,
    reden TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES gebruikers(id),
    eind_at TEXT
  );
  CREATE UNIQUE INDEX ijskast_open ON ijskast (dossier_id) WHERE eind_at IS NULL;
  INSERT INTO ijskast (dossier_id, tot, reden, created_at, created_by, eind_at)
    SELECT u.dossier_id, u.tot, u.notitie, u.created_at, u.created_by,
      CASE WHEN u.tot > date('now', 'localtime') AND d.gesloten_at IS NULL
        AND u.id = (SELECT max(x.id) FROM uitstellen x WHERE x.dossier_id = u.dossier_id AND x.tot > date('now', 'localtime'))
      THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
    FROM uitstellen u JOIN dossiers d ON d.id = u.dossier_id ORDER BY u.id;
  UPDATE audit SET type = 'ijskast_in', payload = json_object('tot', json_extract(payload, '$.tot'), 'reden', json_extract(payload, '$.notitie')) WHERE type = 'uitgesteld';
  DROP TABLE uitstellen;
  `,
  // In-app meldingen for a beheerder about one dossier, shown under the bell in the navbar.
  `
  CREATE TABLE notificaties (
    id INTEGER PRIMARY KEY,
    gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id),
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    titel TEXT NOT NULL,
    created_at TEXT NOT NULL,
    gelezen_at TEXT
  );
  CREATE INDEX notificaties_gebruiker ON notificaties (gebruiker_id, gelezen_at);
  `,
  // The agreed klussendienst_kosten of a dossier past its Bezoek starts at € 50 per regenpijp on Afkoppelen: Ja.
  `
  UPDATE dossiers SET data = json_set(data, '$.klussendienst_kosten', 5000 * (
    SELECT count(*) FROM json_each(dossiers.data, '$.kaart_annotaties') a
    WHERE json_extract(a.value, '$.type') = 'regenpijp'
      AND json_extract(dossiers.data, '$."regenpijp.' || json_extract(a.value, '$.id') || '.afkoppelen"') = 'ja'
  ))
  WHERE bezoek_afgerond_at IS NOT NULL AND json_type(data, '$.klussendienst_kosten') IS NULL;
  `,
  // What a melding is about, and when its eigenaar clicked it away from the dossier page (separate from reading it in the bell).
  `
  ALTER TABLE notificaties ADD COLUMN soort TEXT NOT NULL DEFAULT 'overdracht';
  ALTER TABLE notificaties ADD COLUMN weggeklikt_at TEXT;
  UPDATE notificaties SET soort = 'ijskast' WHERE titel LIKE 'Uit de ijskast:%';
  UPDATE notificaties SET soort = 'mail_mislukt' WHERE titel LIKE 'E-mail niet afgeleverd%';
  `,
];
