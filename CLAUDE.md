# Project instructions

## Wat is er nieuw

Whenever a change alters how the team works with the app, add a bullet to `src/shared/nieuws.ts`, which feeds the admin-only "Wat is er nieuw" page (Beheer menu, `/beheer/nieuw`). The test for each bullet: would an admin do something differently, look in the wrong place, or be confused if nobody told them? If not, leave it out. The admins' time is the cost; a short list gets read.

Include:
- Renamed concepts or steps (Intake → Inschrijving), not shortened labels whose meaning is unchanged.
- Things moved to another page or to another step of the workflow (Afspraken from Plan to Bezoek).
- New capabilities and tools (a new kaart vlak type, freehand drawing, pasting from the clipboard).
- Removed fields or features, and questions whose meaning changed.
- Changed calculations, money and rules (waterberging per regenpijp, Klussendienst fee, when the Uitvoeringsspecificatie is available).
- Layout changes big enough to change how a page is used (Inschrijving fields in rows, regenpijp blocks, grayed-out later steps).
- Fixes to something the team reported as broken.
- Privacy and policy changes.
- Borderline, so include and flag in your summary for me to decide: often-used controls that look different or moved even though they do the same thing (photo slot buttons folded into one + menu), a page clearly showing something differently (large Inschrijving photos on the dossier page), and new navigation (a "Terug naar dossier" link at the bottom of each step page).

Leave out:
- Cosmetic changes: icons, colours, shadows, spacing, small size tweaks, fields reordered within a page, and hint text.
- Changes to help and explanation pages (eg the install instructions): people read them when they need them, so the change reaches them anyway.
- Small control polish (a done-already button shown as a plain link, a dropdown that now shows the current choice).
- Prompts and dialog options that explain themselves when they appear (a "vervangen?" question, an Annuleren button).
- Tooltips.
- Reassurance that existing data was migrated or still shows. If nobody has to act, don't mention it.

Relevance now: a change that qualifies may still not matter to the team at the moment. When unsure, include it and flag it in your summary so I can decide.

Writing:
- Dutch, short, friendly, plain, from the user's point of view ("Je kunt nu ..."), no code or field keys.
- Name the exact thing ("Elk regenpijp-blok", not "Een blok") and avoid words that read two ways ("schrijf je eigen regels", not "typ", which suggests a keyboard).
- Put the bullet in the matching `kop` group of the newest section, or start a new section at the top dated the day of the change. Sections stay newest first.
- The red dot only lights for a section dated later than the one an admin last saw. Once a section is deployed, put further changes in a new section with a later date, not into that one.
- List the bullets you added when summarising the work, so I can review the wording.
