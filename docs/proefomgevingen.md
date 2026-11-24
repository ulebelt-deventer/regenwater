# Proefomgevingen (staging only)

Visitors sign up at `/proberen` with a name and email address and get their own proefomgeving: a copy of the database in which they are the only beheerder. Code: `src/server/proef.ts`; the client page is `src/client/paginas/proberen.tsx`.

## How it works

- Each proefomgeving is a full database at `<DATA_DIR>/proef/<id>/app.db` with its own `fotos/`, served by the unchanged app (`createApp`) over its own `Ctx`. No role or permission knows proefomgevingen exist, so they add no logic to the live site; only `config.proefomgeving` tells the overzicht to show a banner explaining the proefomgeving and its deletion.
- `main.ts` creates `Proefomgevingen` only when `STAGING` is set, and its constructor throws otherwise. It then serves a dispatcher in front of the main app: the SPA, `/health` and `/api/versie` go to the main app; `/api/*` and `/docs/*` go to the proefomgeving named in the `proef` cookie, or to the main app without one.
- A login (`/api/auth/request`, `/api/auth/code`) goes by email address: the visitor's own proefomgeving, else the one in the cookie if that address is a user there (a klusser the visitor added), else the main staging app. So the team logs in to staging as before, even on a browser that has a proefomgeving.
- Every link in a proefomgeving's mail starts with `/s/<id>`, which sets the cookie and redirects to the rest of the path, so login links work on a fresh browser.
- Every mail goes to the owner, without cc, with a boxed note saying who would have got it. The subject gets `[TEST]` like all staging mail. The one exception is mail to exactly one of the team's feedback addresses (`MELDINGEN_FEEDBACK`), which goes out unchanged, so feedback reaches the team.
- `<DATA_DIR>/proef/register.db` lists the proefomgevingen: id, owner email and name, created and last used. "Last used" is updated at most hourly on any request that isn't a 401. `bash devops/list-sandboxes.sh staging` lists them.
- Limits: `PROEF_PER_UUR` new ones per hour and `PROEF_MAX` in total (`src/shared/constants.ts`). An address that already has a staging account gets a 409.

## The sjabloon

New proefomgevingen copy the one owned by `PROEF_SJABLOON` (an email address in `devops/staging.env`); without it they start empty. To set it up:

1. Sign up at `/proberen` with a made-up, distinctive name (say "Sjabloon Beheerder") and an address you receive mail on but that appears nowhere else, such as a plus-address (`you+sjabloon@…`). The login code goes to that address. The copy replaces the name and address everywhere with the visitor's, so a common name would also be replaced inside other text.
2. Fill it with example dossiers, klussers and photos. Use no real data: visitors see all of it.
3. Set `PROEF_SJABLOON` to that address, push the env and restart.

Changes to the sjabloon reach only proefomgevingen made afterwards.

## Deletion

Once a day, and at startup, `ruimOp()` deletes every proefomgeving unused for `PROEF_BEWAAR_DAGEN` (90) days, except the sjabloon. It only removes `<DATA_DIR>/proef/<id>` folders whose id is in the register and matches 12 hex characters; the live and staging databases are `<DATA_DIR>/app.db`, outside that folder. On production the class is never created, so nothing can run.

Proefomgevingen aren't backed up: Litestream and the backup check cover only `app.db` and `fotos/`.
