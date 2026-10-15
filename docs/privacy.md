# Privacy and AVG

Internal notes on how the app handles personal data and where it stands on AVG (GDPR) compliance. The public text is the `/privacy` page (`Privacy()` in `src/client/paginas/uitleg.tsx`), reachable without logging in; it stays marked as a concept until the open questions below are settled.

## Roles

- **Verwerkingsverantwoordelijke (controller):** not decided yet. The public text, the retention period and who signs the DPAs all depend on it.
- **Technisch beheerder (maintainer):** a volunteer acting under Ulebelt's authority (AVG Art. 29), so part of the organization rather than a processor; no separate agreement needed. The privacy page mentions the role, not the person.

## Personal data stored

- Bewoners: name, e-mail, phone, address, rent or own, and through the dossier photos of house and garden, a sketch on the cadastral map, RD coordinates, measurements and agreements.
- App users (volunteers, admins): name, e-mail, phone, login times, and an audit trail of every change with who made it.
- No special categories (health, religion, etc.).

## Processors (need a DPA)

The web admin keeps a copy of each DPA in `_files/` in their checkout of this repo (gitignored, never committed, since the DPAs carry account details). Each one can also be downloaded again from the provider, as listed below.

| Processor | Role | Location | DPA |
| --- | --- | --- | --- |
| Netcup | VPS: app, database, photos | Germany | Concluded 2026-10-15 via CCP > Stammdaten > Auftragsverarbeitung (the PDF download is an unstyled link in the confirmation message). |
| Mailgun (Sinch) | Sends login and notification e-mails | US company, EU region | Sinch's [Data Processing Agreement](https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/) is part of the service terms, so it applies without signing. Save the version in force as PDF. |
| Scaleway | Litestream and photo backups (once `BACKUPS=s3`) | EU | Part of the service terms; saved as PDF. |

## Recipients that are not processors

Where the line is: name the processors Ulebelt hires, and the categories of recipients Ulebelt hands data to (klussers, woningcorporaties, map services). What a recipient does next, such as a klusser's mailbox provider, is the recipient's responsibility and is not listed. AVG Art. 13 allows categories instead of a full list.

The privacy page names the map services as one category ("openbare kaartdiensten"). They receive only an address or location, never a name or contact details.

- PDOK (Kadaster) and BRO: address and soil lookups from the server.
- The gemeente sewer maps on ArcGIS Online (Esri): `src/server/riool.ts` sends the RD coordinates.
- Google Street View: opened by an admin from the intake link. It counts the same as a server call, because the admin acts for Ulebelt.

Healthchecks pings are empty POSTs and fonts are self-hosted, so neither receives personal data.

## Privacy choices in the app

- Photo resizing strips EXIF, GPS included.
- The Signal call for volunteers names only street and place; the e-mail to a klusser names the address but not the bewoner.
- Deleting a dossier removes its data, photos and audit entries; one "dossier verwijderd" event remains, naming the address.

## Open

- Decide the controller (see Roles).
- Retention period, for live data and for backups (backup retention decides how long deleted data lingers).
- Final public text on `/privacy`, then drop the concept banner.
