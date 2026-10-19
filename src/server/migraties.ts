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
];
