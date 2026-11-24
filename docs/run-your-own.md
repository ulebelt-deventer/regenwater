# Run your own copy

This guide takes you from nothing to your own live copy of the app, with your own name and logo, on your own server. It is written for the person in your group who does the technical setup. You should be comfortable typing commands in a terminal and logging in to a server with `ssh`. Plan for an afternoon, plus a day of waiting for DNS and the mail provider to check your domain.

Every command below runs on your own laptop (Mac or Linux; on Windows use WSL), from the folder you cloned. The scripts log in to the server over SSH and do the work there, so you never have to install anything on the server by hand. We recommend using your AI coding agent to review and conduct these changes.

## What you need

| What | Why | Notes |
| --- | --- | --- |
| A server (VPS) | Runs the app | For a budget option we recommend [Netcup](https://www.netcup.com/): a VPS with 2 GB of memory in Germany is plenty and keeps your data in the EU. Any provider with a fresh Debian or Ubuntu server works. |
| A domain name | The app's address, such as `regenwater.example.org` | A subdomain of your organisation's website is fine. You need to be able to change its DNS records. |
| [Mailgun](https://www.mailgun.com/) | Sends login links and e-mails to residents | Create the sending domain in the EU region. OR ask your AI to set up a different mail provider. |
| An S3 bucket in the EU | Backups of the database and photos | Any S3-compatible storage, such as [Scaleway](https://www.scaleway.com/) Object Storage. Turn on versioning with a retention rule, so a bad delete can be undone. |
| [Healthchecks.io](https://healthchecks.io/) | Mails you when the app or the backup stops working | Free for this use. Two checks, each with a period of 1 day. |
| Node 26 and git on your laptop | To build and check the app before each deploy | `nvm use` in the project folder picks the right Node. |

## 1. Get the code

Fork this repository on GitHub (or clone it and push it to your own repository), then clone your copy and install it:

```sh
git clone https://github.com/<your-account>/regenwater.git
cd regenwater
npm install
npx playwright install chromium
```

Follow the "Development quickstart" in the [README](../README.md) to run it on your laptop. You'll use that to check your changes in the next step.

Your branding lives in commits on your own copy. To pick up later improvements from De Ulebelt, pull from this repository into yours and deploy again.

## 2. Make it yours

**Please don't use the Ulebelt name or logo without our permission.** The code is yours to use under the EUPL licence, but our name and logo are not part of it. Replace them before you go live.

To find every place the name appears, search the code for it: `grep -rn "Ulebelt" src`. The main ones:

- **Name and contact address**: `APP_NAAM` and `ULEBELT_CONTACT_EMAIL` in `src/shared/constants.ts`, the `<title>` in `src/client/index.html`, the page title in `src/client/ui.tsx`, and `name` / `short_name` in `src/client/public/manifest.webmanifest`.
- **Logo**: `src/client/public/ulebelt-logo.svg` is shown in the top bar and on the PDFs. Replace it with your own SVG; if you give the file a new name, update the two places that use it (`src/client/layout.tsx` and `src/server/documenten/onderdelen.tsx`).
- **App icons**: the PNG and ICO files next to the logo in `src/client/public/` (favicon, home-screen icons).
- **Colours**: the colour variables at the top of `src/client/styles.scss`, and `theme_color` / `background_color` in the manifest.
- **Texts that name the organisation**: the Plan van Aanpak (`src/server/documenten/plan.tsx`), the field texts (`src/shared/velden.ts`), the login mail (`src/server/auth.ts`) and the default e-mail templates (`src/shared/sjablonen.ts`). The templates are copied into the database the first time the app starts; after that you edit them in the app under Beheer > E-mailsjablonen.
- **Privacy page**: `src/client/paginas/uitleg.tsx` names the organisation responsible for the data and its address. Under the AVG that is now your organisation, so update it, and read `docs/privacy.md` for the processors you are using.

Some settings are specific to the Deventer region:

- **Housing corporations**: `CORPORATIES` in `src/shared/constants.ts`.
- **Sewer maps**: `RIOOLKAARTEN` in the same file links to each municipality's sewer map. Finding the sewer system automatically only works for Deventer, Raalte and Olst-Wijhe (`src/server/riool.ts`). For other municipalities the app says so, and the volunteer checks the map by hand.
- **Subsidy pages per municipality**: edit these in the app, under Beheer.
- **Storage norms**: how much water each downpipe must store can differ per municipality; see `docs/berekening.md`.

Check the result with `npm start`, then commit your changes. The deploy script ships only committed code, and it runs the unit tests first: if a test checks a text you changed, update the test too.

## 3. Rent the server

At Netcup (or your provider of choice), order a VPS with a current Debian, and add your SSH key when you set it up. Note its IP address, and check that you can log in:

```sh
ssh root@<ip-address>
```

## 4. Point your domain at it

At the company that manages your domain, add an **A record** for your app's address (say `regenwater.example.org`) pointing to the server's IP address.

While you're there, add the DNS records Mailgun shows for your sending domain, so your mail doesn't end up in spam.

DNS changes can take a few hours. The server asks for its HTTPS certificate on its own, but only once the domain points at it.

## 5. Fill in the settings

Two files in `devops/` hold your settings. Both are ignored by git, so your passwords never end up in the repository.

**Where to deploy** (`devops/deploy.production.env`):

```sh
cp devops/deploy.env.example devops/deploy.production.env
```

Fill in `DEPLOY_HOST` (the server's IP address) and `DOMAIN` (the app's address, without `https://`).

**The app's secrets** (`devops/production.env`):

```sh
cp devops/staging.env.example devops/production.env
```

Delete the `STAGING` and `PROEF_SJABLOON` lines (they are for a test site), and replace every other value. The comments in the file explain each one:

- `BASIS_URL`: the app's full address, such as `https://regenwater.example.org`.
- `MAILGUN_API_KEY`, `MAILGUN_DOMEIN`: from your Mailgun account.
- `MAIL_AFZENDER`: the name and address mail is sent from, such as `Regenwater Buurtgroep <regenwater@example.org>`.
- `MELDINGEN_FEEDBACK`: who receives the feedback that users send from the app.
- `HEALTHCHECK_URL`, `BACKUP_HEALTHCHECK_URL`: the ping addresses of your two Healthchecks.io checks.
- `S3_...`: your bucket's address, name and access keys.

## 6. Set up the server and deploy

Run these four in order. Each one prints what it is doing and stops with a clear error if something is missing.

```sh
bash devops/host-setup.sh production   # once per server: firewall, Node, web server, backup tools
bash devops/provision.sh production    # the app's user, folders, services and web address
bash devops/push-env.sh production     # uploads devops/production.env to the server
bash devops/deploy.sh production       # checks, builds and ships the app
```

The deploy ends by waiting until the app answers. Check it with:

```sh
bash devops/status.sh production
```

## 7. Add the first coordinator

The first beheerder is added on the server; everyone else is invited from the Gebruikers page in the app. Replace `<host>`, the name and the e-mail address:

```sh
ssh root@<host> "systemd-run --pipe --wait --quiet -p User=regenton-production -p WorkingDirectory=/srv/regenton/production/app -p EnvironmentFile=/etc/regenton-production.env -E APP_MODUS=production -E DATA_DIR=/srv/regenton/production/data -E TZ=Europe/Amsterdam /usr/bin/node dist/server/jobs.js beheerder 'Your Name' you@example.org"
```

Open your app's address, enter that e-mail address, and log in with the code you receive.

## 8. Before you enter real data

- **Test the backups.** Do a full restore to a fresh server once, as described under "First time" in `devops/README.md`, so you know it works before you need it.
- **Read `docs/privacy.md`** and make sure your organisation is comfortable with it: you are now responsible for the residents' data.

## Keeping it running

- **Deploy an update**: commit, then `bash devops/deploy.sh production`. Database changes run on their own when the app starts.
- **See what's going on**: `bash devops/status.sh production` and `bash devops/logs.sh production`.

`devops/README.md` is the full reference for these scripts. It also covers running a separate test site next to the live one on the same server, so you can try changes before your volunteers see them.
