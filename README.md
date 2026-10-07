# Ulebelt Regenton portal

A web portal for the Ulebelt rainwater project (Regenwater / Regenton). Volunteers (klussers) visit homes, design a rainwater capture plan, and install rain barrels. The portal follows each household from intake to installation as one dossier. Admins (beheerders) set up dossiers and assign the work. Klussers do the on-site visit, fill in the plan and record the installation. The app produces the PDFs and e-mails that go to the bewoner and the woningcorporatie. The interface is in Dutch and built mobile-first, since most of the work happens on a phone in someone's backyard.

## Main features

- **Dossiers**: one per address, moving through 11 steps (defined in `src/shared/status.ts`): intake, assign a bezoeker, plan and do the bezoek, finish the Plan van Aanpak, admin check and send, akkoord from the corporatie (huur) or the bewoner's choice (koop), assign an uitvoerder, do the work, send the opleverrapport. Status and "aandacht nodig" findings are computed from the dossier's data, never stored.
- **Intake**: address lookup through PDOK, kadastrale kaart, luchtfoto, and a boorprofiel auto-filled from the nearest boring (BRO / DINOloket).
- **On-site visit and plan**: field forms with autosave, photos with drawn annotations, daken / tuinen / regenpijpen, and a materials list with cost estimate.
- **Documents**: PDFs (plan, opleverrapport), a concept-Plan preview, paper bezoekformulieren and a materials print page, all rendered on the server and printed with Chromium.
- **E-mail**: login links, notices to klussers, bewoners and corporaties from editable templates (sjablonen), admin alerts (meldingen), and a weekly digest.
- **Lists and overview**: an Overzicht with counts for admins, and a filterable, sortable Dossiers list with CSV export.
- **Users**: beheerder and klusser roles, passwordless login (an e-mailed link plus a 6-digit code), archiving, "Inloggen als" impersonation, and an audit log (Activiteit).
- **Offline-friendly**: photos queue in IndexedDB and upload when the connection comes back. The app can be installed to the home screen.

## Stack

TypeScript throughout: a Hono server on Node 26, SQLite through `better-sqlite3` (plain SQL migrations that run on boot), a SolidJS + Bootstrap 5 SPA built with Vite, and Playwright's Chromium for the PDFs. Code lives in `src/server`, `src/client` and `src/shared` (field definitions and status rules used by both sides).

## Development quickstart

Requirements: Node 26 (`nvm use` reads `.nvmrc`).

```sh
npm install
npx playwright install chromium   # needed for PDF rendering and the e2e tests

# Seed yourself as an admin (creates data/app.db and runs migrations if needed)
npm run beheerder -- "Your Name" you@example.org

npm start   # same as npm run dev
```

Then open http://localhost:7425 and log in with that e-mail. **No mail is sent in development.** Each e-mail is written to `tmp/emails/*.html`, and the server prints a line `email sent to ..., view at: <path>`. Open that file to get the login code or link.

Notes:

- `npm start` / `npm run dev` starts the Vite client on 7425 (proxying `/api`, `/docs` and `/health`) and the API server on 3000, rebuilding and restarting the server on change. Use the 7425 URL (the server's startup line prints it too). Login links point there. Production doesn't use `npm start`: its systemd unit runs `node dist/server/main.js`.
- Data lives in `data/` (gitignored): `app.db` and `fotos/`. Delete the folder to start fresh, then seed again. `DATA_DIR=...` points the server and the seed command somewhere else.
- `npm run beheerder` rebuilds the server bundle first, so run it before `npm start` (or expect the dev server to restart once). It fails if the e-mail already exists. Add further users from the Gebruikers page in the app.
- The intake fetches live data from PDOK, BRO and DINOloket, so it needs an internet connection.

## Tests and checks

```sh
npm run typecheck
npm run lint
npm run test:vite   # Vitest unit tests
npm run test:e2e    # builds, then runs the Playwright scenarios
npm test            # both
```

## Docs and deployment

- `docs/spec.md`: UI and workflow spec, page by page.
- `docs/architecture.md`: stack, storage, e-mail, photos, PDFs, monitoring and backups.
- `docs/TODO.md`, `docs/questions.md`: open work and open questions.
- `devops/README.md`: VPS provisioning, deploys and operations.
