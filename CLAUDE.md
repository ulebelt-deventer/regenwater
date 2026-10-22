# Project instructions

## Wat is er nieuw

Only when a change alters how the team works with the app, add a bullet to `src/shared/nieuws.ts`, which feeds the admin-only "Wat is er nieuw" page (Beheer menu, `/beheer/nieuw`). The test for each bullet: if nobody told them, would an admin miss something they need, keep doing it the old way, or get it wrong? A change they will notice and understand the moment they meet it on the page fails that test, however much the page changed. The admins' time is the cost; most changes get no bullet, and a short list gets read.

Include:
- Renamed concepts or steps (Intake → Inschrijving), not shortened labels whose meaning is unchanged.
- Things moved to another page or to another step of the workflow (Afspraken from Plan to Bezoek), where people would look in the old place.
- New capabilities and tools they wouldn't stumble on, or that change a habit (a new kaart vlak type, freehand drawing, pasting from the clipboard).
- Removed fields or features, and questions whose meaning changed.
- Changed calculations, money and rules (waterberging per regenpijp, Klussendienst fee, when the Uitvoeringsspecificatie is available).
- Fixes to something the team reported as broken and worked around, so they can stop working around it.
- Privacy and policy changes.

Leave out:
- Anything visual: restyled or reworded buttons, controls that look different but do the same thing, layout, icons, colours, spacing, fields reordered within a page, hint text, tooltips.
- A different control for the same input (a time picker becoming two selects) and a field also shown on another page: both explain themselves where they appear.
- Changes to help and explanation pages: people read them when they need them.
- Prompts and dialog options that explain themselves when they appear (a "vervangen?" question, an Annuleren button).
- Reassurance that existing data was migrated or still shows. If nobody has to act, don't mention it.

When unsure, leave it out and name it in your summary so I can decide.

Writing:
- Dutch, short, friendly, plain, from the user's point of view ("Je kunt nu ..."), no code or field keys.
- Name the exact thing ("Elk regenpijp-blok", not "Een blok") and avoid words that read two ways ("schrijf je eigen regels", not "typ", which suggests a keyboard).
- Put the bullet in the matching `kop` group of the newest section, or start a new section at the top dated the day of the change. Sections stay newest first.
- The red dot only lights for a section dated later than the one an admin last saw. Once a section is deployed, put further changes in a new section with a later date, not into that one.
- List the bullets you added when summarising the work, so I can review the wording.
