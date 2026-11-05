# Project instructions

## Wat is er nieuw

When a change is a significant enough addition or change to the workflow to be worth calling attention to, add a bullet to `src/shared/nieuws.ts`, which feeds the admin-only "Wat is er nieuw" page (Beheer menu, `/beheer/nieuw`). The test is significance, not whether the change is noticeable when clicking around: a bullet is most necessary for invisible changes, but a visible change gets one too when it is significant enough, such as a new step, field group or photo slot. The admins' time is the cost; small changes get no bullet, and a short list gets read.

Include:
- Renamed concepts or steps (Intake → Inschrijving), not shortened labels whose meaning is unchanged.
- Things moved to another page or to another step of the workflow (Afspraken from Plan to Bezoek), where people would look in the old place.
- New capabilities and tools, even visible ones, that add to the workflow or change a habit (a new kaart vlak type, freehand drawing, pasting from the clipboard, a new photo slot).
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
