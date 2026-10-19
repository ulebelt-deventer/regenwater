# Project instructions

## Wat is er nieuw

Whenever a change is user-visible in a way the team would notice (something moved, renamed, added, removed, or works differently), add a bullet to `src/shared/nieuws.ts`, which feeds the admin-only "Wat is er nieuw" page (Beheer menu, `/beheer/nieuw`). Skip tiny polish such as spacing, widths or colours.

- Write in Dutch: short, friendly, plain language, from the user's point of view ("Je kunt nu ..."), no code or field names.
- Put the bullet in the matching `kop` group of the newest section, or start a new section at the top dated the day of the change. Sections stay newest first.
- The red dot only lights for a section dated later than the one an admin last saw. Once a section is deployed, put further changes in a new section with a later date, not into that one.
- Mention the bullets you added when summarising the work, so I can review the wording.
