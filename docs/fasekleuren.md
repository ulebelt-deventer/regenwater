# Fasekleuren

Two palettes for coloring the status label by phase of the workflow instead of by who it lies with. Neither is in use: the status label is colored by "ligt bij" (see "Huisstijl" in `spec.md`), using the yellow, blue and lavender of palette C.

## Phases

| Fase | Steps |
| --- | --- |
| 1. Inschrijving | Inschrijving |
| 2. Bezoek & plan | Bezoeker toewijzen, Bezoek plannen, Bezoek uitvoeren, Plan van Aanpak afronden |
| 3. Controle | Plan controleren & versturen |
| 4. Akkoord | Plan goedkeuren (huur), Klussendienst of zelf? (koop) |
| 5. Uitvoering | Uitvoerder toewijzen, Werk uitvoeren |
| 6. Oplevering | Opleverrapport versturen |

Gesloten stays gray (`#e4e4e4` background, `#555` text) in both. Neither palette uses red, which means "aandacht".

## A. Pastel regenboog

One OKLCH hue sweep from yellow through green and blue to purple, with background `oklch(0.93 0.07 h)` and text `oklch(0.40 0.10 h)` for every phase, so no phase stands out more than another. Every phase is equally light, so in grayscale or for color-blind users the phases can't be told apart; only the hue carries the order. Text contrast is 7.0 to 7.7.

| Fase | Hue | Background | Text |
| --- | --- | --- | --- |
| 1 | 95 | `#f6e8b3` | `#594600` |
| 2 | 140 | `#d0f4c8` | `#26541c` |
| 3 | 185 | `#b3f8ee` | `#00584f` |
| 4 | 235 | `#bbf0ff` | `#004e75` |
| 5 | 275 | `#dae5ff` | `#39417d` |
| 6 | 305 | `#f3ddff` | `#543772` |

## C. Huisstijl

The same journey, with each text color a huisstijl tone or a darkened one: lichtgroen, donkergroen, blauw and aubergine, with yellow before them and lavender between blauw and aubergine. It fits the rest of the app best; the steps between phases are less even than in A. Text contrast is 5.4 to 9.8.

| Fase | Background | Text |
| --- | --- | --- |
| 1 | `#f8e9a6` | `#5c4a00` |
| 2 | `#d9f0c6` | `#2f5e12` |
| 3 | `#c4e6d6` | `#00643c` |
| 4 | `#d6e5f7` | `#1d4f8f` |
| 5 | `#e0daf3` | `#3f2f86` |
| 6 | `#ecdbe2` | `#462832` |
