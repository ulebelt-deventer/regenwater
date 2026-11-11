# Architecture

Load is tiny (about 15 active users a day), so the design optimizes for simplicity and low maintenance, not scale. The UI and behavior are specified in `spec.md`.

## Hosting

- Prototype: the maintainer's US-based VPS, for the team demo. No real data goes in until the app is redeployed to production.
- Production: a Netcup VPS with 2 GB RAM in Germany, for the AVG, running only this app. 1 GB of swap as a safety margin. Server timezone Europe/Amsterdam.
- Caddy in front of Node for automatic HTTPS.
- The domain and production VPS account belong to the organization, with the maintainer as administrator.

## Stack

- TypeScript everywhere. One shared module (`src/shared`) holds the field definitions, the status rules and the aandacht rules, used by both server and client. One field list drives the edit forms, the PDFs, the concept-Plan, the paper bezoekformulieren, the Controle text, the CSV, the audit labels and `plan_gewijzigd_at`; one rule list drives the status, the aandacht findings and the Statussen and Aandacht-criteria pages.
- Field definitions are plain typed objects in code (key, label, input type, options, which sub-page, `inPlan`/`inOpleverrapport`, who may edit, whether Controle checks it, a `visibleIf` predicate on the dossier), not a JSON schema or a form library. Pages lay out their sections by hand and render each field from its definition, so odd layouts (the photo slot column, the kaart, the materials table) stay ordinary components.
- Node 26, locally and on the server (pinned in `package.json` `engines` and `.nvmrc`).
- Server: Hono on Node. SQLite through `better-sqlite3` (a single file, no database server to run), with plain SQL migrations and no ORM.
- Dossier storage: real columns for everything the app filters, sorts or counts on (adres parts, plaats, huur/koop, bezoeker and uitvoerder, every milestone `_at/_by`, closing). All other form fields live in one JSON column keyed by field key, with repeating items (daken, tuinen, regenpijpen, materiaal rows) as objects keyed by their stable IDs. An autosave PATCH sets one key path, which is what makes "last write wins per field" hold. Values the app derives itself (the riool autodetectie) live in a separate `extra_json` column, out of reach of the autosave.
- Client: SolidJS single-page app, built with Vite, styled with Bootstrap 5 (themed to the huisstijl via Sass variables). Every page, the login page included, is rendered in the browser from JSON returned by the Hono API. The server renders HTML only for documents: the PDFs, the concept-Plan, the paper bezoekformulieren, the materials print page and the emails. `eslint-plugin-solid` is mandatory: destructuring props or returning early from a component silently breaks reactivity, and the linter catches most of those.
- Status and aandacht are computed on demand from the dossier's data, never stored or recomputed in the background. The dossiers list loads the rows that match its plain SQL filters, computes status and findings in memory, then filters, sorts and paginates; at thousands of dossiers that's milliseconds.
- Figtree is self-hosted (woff2 in the build), not loaded from Google Fonts, which would send visitors' IP addresses to Google.
- Layout: the app lives at the repo root, in `src/server`, `src/client` and `src/shared`.
- Mobile-first, Dutch interface. Users log in with an emailed link plus a 6-digit code, no passwords.
- Sessions are rows in SQLite, checked on every API request together with the user's archived flag, so archiving a user locks them out on their next request. That check already loads the user row, so a request writes `last_active_at` only when the stored value is over 5 minutes old.
- Login codes and rate limits are SQLite tables too: one row per issued code (hashed, with expiry, wrong-attempt count, used/voided time) and one row per login request or code attempt (e-mail, IP, time), counted over the past hour and pruned daily.
- Impersonation ("Inloggen als") sets `impersonated_user_id` on the admin's own session row; no second session is created. Each request authorizes as the impersonated klusser (after checking that both are active and the admin is still an admin, else it clears the field), while audit events record the admin as actor with the klusser in an `impersonated_user_id` column.
- Installable to the home screen: `manifest.webmanifest` (name, `display: standalone`, crème background, donkergroen theme color) with 192px, 512px and maskable 512px icons, plus a 180px `apple-touch-icon` without transparency for iOS. All icons and the favicon are the logo's "U" (with the owl eyes) on crème, cut from page 2 of the huisstijl PDF (`tmp/reference/ulebelt-u-cut.png`) and already generated in `src/client/public/`; the maskable one keeps the U inside the central 80% so Android's mask doesn't clip it. A home-screen app on iOS has its own cookies, separate from Safari's, so the user logs in again there; the 6-digit code makes that work.

## Email

- Mailgun, EU region, sends the login emails, the klusser/bewoner/corporatie emails and the admin meldingen.
- Melding recipients are comma-separated lists in the environment: `MELDINGEN_DIGEST` and `MELDINGEN_FEEDBACK`. Meldingen about one dossier go to its eigenaar instead. The app refuses to start in production if one is missing or holds an invalid address. Each recipient gets a separate email, so one refusal doesn't block the others.
- Sender domain: the domain admin adds Mailgun's SPF and DKIM records and a DMARC policy before launch. Every email sets Reply-To explicitly, so replies reach a person.
- Bounces: a Mailgun webhook (`/webhooks/mailgun`, signature-verified) marks failed sends and triggers the "E-mail niet afgeleverd" melding. It's a later addition, not part of the first milestones; until then a rejection at send time is the only failure the app sees.
- Keep attachments under about 10 MB, since many corporatie mail servers reject larger messages; the PDF renderer downsizes embedded images if needed.
- In development nothing is sent: each email is written to a local `.html` file under `tmp/emails/`, and the server logs one line: `email sent to <to>, subject <subject>, view at: <path to .html file>`.

## Photos and annotations

- Resized in the browser before upload to 1200px (longest side) JPEG, roughly 150-250 KB each (canvas / `createImageBitmap`, which all modern phone browsers support). This also makes uploads fast on a mobile connection in a backyard. The luchtfoto and the boorprofiel are the exceptions: the server fetches the luchtfoto from the WMS, and the boorprofiel as an SVG from whichever of BRO and DINOloket has the nearest boring with a layer description. The DINOloket endpoints are undocumented (taken from its `/uitgifteloket/api/config/properties`), so they may change without notice.
- Accepted input: JPEG, PNG, WebP, GIF, HEIC where the browser can decode it (Safari), and SVG. SVGs are rasterized like the rest rather than stored as-is: an SVG can carry script, so storing one means sanitizing it, and one pipeline is simpler. Anything the browser can't decode gets an error pop-up.
- Resizing strips EXIF data, GPS location included, which is good for privacy.
- Upload queue in IndexedDB (localStorage holds only about 5 MB), so a photo taken without a connection, or during a reload, is sent when the connection returns.
- Stored on the VPS disk under UUID filenames. Served only through an API route that checks the session and the user's access to that dossier, with `Cache-Control: private`; an unguessable URL alone isn't enough, because URLs leak through history and forwarding and can't be revoked when a klusser is archived or reassigned. The PDF renderer reads images from disk.
- Luchtfoto: request the PDOK WMS in RD (EPSG:28992), so pixels map directly to meters.
- Annotations are stored as JSON in image coordinates and drawn as SVG on top of the photo, hand-written rather than through a canvas library. The same SVG drawing function serves the editor and the PDFs.
- Daken, tuinen, regenpijpen and materiaal rows have stable internal IDs. Their labels (D1, T1, A) are derived from their order, so renumbering after a delete changes no stored reference, queued edit or audit entry.

## PDF reports

- The PDFs and the concept-Plan are Solid components rendered to HTML on the server (Solid's `renderToString`, from a separate Vite server build of the same source). The concept-Plan is that same HTML shown as a page, so it can't drift from the PDF; Playwright's Chromium prints the PDFs. Playwright is a production dependency, and its Chromium is installed on the server by `deploy.sh`.
- One render at a time through a simple queue, because each render uses 200-500 MB of RAM. Chromium runs inside the app's systemd unit, so `MemoryMax` must allow for it (about 1.2 GB, not the sample's 512 MB).

## Testing

- Exhaustive suite covering every conceivable edge case: thorough unit tests for each section of the spec, in addition to the end-to-end scenario tests listed in the UI spec.
- Vitest for the shared rules and other unit tests; Playwright for the scenario tests and the browser-only behavior (offline queue, drawing, drag and drop). `npm test` runs both; `npm run test:vite` and `npm run test:e2e` run one. Run the full suite before deploying: `deploy.sh` runs only Vitest.
- The server takes its clock from an injectable source, settable in tests, because the aandacht rules depend on elapsed days and Playwright's `page.clock` only moves the browser's clock.
- Scenario tests assert PDF content on the rendered HTML; one smoke test prints a real PDF.

## Deployment

Bash scripts adapted from `tmp/devops-SAMPLE`, run from the maintainer's machine over SSH. No Docker, no platform-as-a-service. The VPS runs only this app, in two environments, production and staging, which every script takes as its first argument. Each environment has its own port (3000 / 3001), system user, units, `/srv/regenton/<env>` directory, env file and Caddy site, all named `regenton-<env>`, so the two never share data. The scripts also support a shared host where `deploy.<env>.env` points at a private Node (`NODE_BIN`) and turns backups off (`BACKUPS=none`), and `host-setup.sh` is skipped.

- `config.sh`: validates the environment argument, reads the gitignored `deploy.<env>.env` (host, domain) and provides the `remote`/`remote_sudo` helpers.
- `host-setup.sh`: once per VPS. Apt packages, Node, Caddy, fail2ban, unattended-upgrades, swap, timezone, Litestream, rclone.
- `provision.sh`: idempotent, rerun whenever the units change. Creates the system user and `/srv/regenton/<env>/{app,browsers,data,logs}` (photos in `data/fotos`), the hardened systemd unit for the app (`EnvironmentFile=/etc/regenton-<env>.env`), the Litestream service, the scheduled jobs below, and the Caddy site.
- `deploy.sh`: typecheck, lint, unit tests and build locally; rsync an allow-list to the server; `npm ci --omit=dev` and the Playwright Chromium install only when `package-lock.json` changed; restart (migrations run on boot); poll `/health` until it answers.
- `push-env.sh`: writes `/etc/regenton-<env>.env` (Mailgun key, healthcheck URLs, S3 credentials) from the local gitignored `devops/<env>.env`.
- `status.sh`, `logs.sh`, `restart.sh`: health, memory, recent errors, backup age and disk at a glance; journald logs; restart.

Scheduled jobs are systemd timers, defined in `provision.sh`, each running a small Node script as the app user with the same environment file. Timers rather than crontab entries because the sample scripts already use them, `Persistent=true` catches up on a run missed during a reboot, and output lands in journald next to the app's logs.

- Weekly digest: `OnCalendar=Mon 08:00`.
- Daily backup check (see Backups).

## Monitoring

- Healthchecks.io check 1 (period 1 day): the app pings it once a day while running, and pings `/fail` on anything logged at warning level or above (server error, PDF render failure, failed send, "login geblokkeerd"), at most once an hour. Healthchecks emails the maintainer on a fail ping or a missed day, so a dead VPS is noticed too. This is the only error alert: it emails only when the check changes state, and the check goes back up only at the next daily success ping, so in practice it's at most one alert a day. The alert carries no details; the maintainer reads the logs (`logs.sh`) to see what went wrong.
- Healthchecks.io check 2 (period 1 day): the daily backup check pings it on success, `/fail` otherwise.

## Backups (S3-compatible object storage in the EU)

- Database: Litestream continuously replicates SQLite to the bucket, as a systemd service with `Restart=always`. It takes consistent snapshots, which copying the raw file while the app is writing to it doesn't guarantee.
- Photos: synced to the same bucket by `rclone` in the daily backup check.
- Litestream has no alerting of its own, so the daily backup check proves the backup works: it syncs the photos, restores the latest Litestream replica to a temp file, runs `PRAGMA integrity_check`, checks that the newest audit event in the restore is recent, and pings healthchecks check 2 with the result.
- Keep versioned backups with retention, so an accidental delete or a bug doesn't wipe the backup as well. The retention period also answers the AVG question of how long deleted data lingers.
- Test a full restore to a fresh VPS once before launch, and write the steps down.

## Build order

Stop after each milestone with a summary, so the maintainer can review, commit and give feedback.

1. Foundations: shared field and rule module, the status rules and the Statussen page, the autosave system, the audit trail and Alle activiteit. Login (link, code, rate limits), sessions, Gebruikers list and Gebruiker page with archiving and Inloggen als. Navbar, Account menu, install guide, footer with the privacy placeholder page, and the feedback pop-up and Feedback page.
2. Dossiers: Overzicht, Dossiers list (filters, sort, pagination, CSV), the details page (status, notities, close, reopen, delete), and the Inschrijving sub-page with PDOK address and parcel lookup, rioolkaart links and riool autodetectie (the gemeenten's public ArcGIS layers, see `src/server/riool.ts`), nearest-boring lookup (BRO and DINO), photo slots with annotations, and the luchtfoto from the WMS. The email preview pop-up, E-mailsjablonen (seeded from the prototype's drafts, completed for the ones it lacks), the subsidie mail, the Signal oproep and assigning the bezoeker.
3. Bezoek sub-page and the kaart editor; the printable and Leeg bezoekformulier PDFs.
4. Plan van Aanpak sub-page and Materialen beheer, the concept-Plan and Plan PDF, Plan versturen & goedkeuring, assigning the uitvoerder.
5. Uitvoering and Oplevering: the opleverrapport and the Uitvoeringsspecificatie page.
6. Aandacht rules and the Aandacht-criteria page, snoozes, Plan gewijzigd, admin meldingen and the weekly digest.
7. Deployment scripts, monitoring and backups; restore test.
8. Later: the Mailgun bounce webhook; the one-off import of the Ulebelt admin's spreadsheet, if the team wants it.
