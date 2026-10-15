# Waterberging per regenpijp

How the app estimates how much water each regenpijp must be able to store or infiltrate. Code: `src/shared/kaart.ts` (`kaartItems`, `dichtstbijzijndeVerdeling`, `waterberging`).

## Formula

`V = Σ (share × m²) × NORMAFVOER_MM`, summed over every dakdeel the pijp drains. 1 m² × 1 mm = 1 liter, so 34 m² at 20 mm is 680 liter. The uitleg shows the sum, eg `62% × 42 m² + 8 m² = 34 m² × 20 mm = 681 liter` (liters are rounded from the unrounded m²).

- **m²** is the horizontal projected area: what the kadasterkaart gives, or what the bezoeker types on an unscaled kaart. Rain falls (nearly) vertically, so the projection is the catching area and a sloped roof needs no slope correction.
- **Runoff coefficient** is taken as 1.0: pitched tiles, bitumen and metal shed practically all water. A green or gravel roof sheds less (roughly 0.3 to 0.7), which the app ignores, so it overestimates there.
- **NORMAFVOER_MM** (`src/shared/constants.ts`) is 20 mm, a PLACEHOLDER pending the team: the sample plan says 20 mm but its numbers match 10 mm.

## Which pijp drains which part of a dakdeel

Assumption: water on a roof runs to the nearest regenpijp. Each dakdeel is split into nearest-pijp regions (a Voronoi diagram of the pijpen, clipped to the dakdeel polygon with Sutherland-Hodgman), and each pijp's share is its region's area. Shares are whole percents (largest-remainder rounding, so they sum to 100); a pijp at 0% is dropped.

Which pijpen take part: a pijp links to every dakdeel within `KOPPEL_M` (1 m) of it on a scaled kaart. If none is that close, or the kaart is unscaled, it links to the nearest dakdeel only.

Where nearest-pijp is wrong, and the bezoeker should set the verdeling by hand:

- **Gutters decide, not distance.** A gutter along the eaves carries water sideways to wherever its outlet is, often past a closer pijp, and a gutter sloped one way sends everything to one end.
- **L-shaped and hipped roofs.** Each roof face drains to its own eaves; a Voronoi line ignores ridges and valleys.
- **An aanbouw draining over the main roof** (or a dakkapel onto the roof below) adds its water to a pijp that may be far from it in plan.

## Hand-set verdeling

Stored as `dak.<id>.verdeling`: `{pijpId: pct}` with whole percents 1 to 100 summing to 100, `{}` for "by hand: no regenpijp", or `null` for automatic. A hand-set verdeling equal to the automatic one is stored as `null`.

- Checking a pijp re-runs the nearest-pijp split over the checked pijpen; each checked pijp gets at least 1%.
- Typing a percent sets that pijp and scales the others proportionally.
- A verdeling naming a pijp that no longer exists is *verlopen*: the automatic split is used and Controle asks to check it.
- Editing the kaart clears the hand-set verdeling of every dakdeel the edit touches (the dakdeel itself changed, or a pijp that links to it or appears in its verdeling was added, moved or removed), with a melding and undo.

## Norms (to verify)

Cited from memory; check before quoting them to anyone:

- **NEN-EN 12056-3** (gravity drainage inside buildings, roof drainage): sizes gutters and pijpen from rainfall intensity in l/(s·m²) times the effective roof area. It deals in flow rate, not stored volume, so it supports the area and runoff assumptions above, not the 20 mm.
- **NEN 3215** (Dutch binnenriolering): the national supplement, with Dutch design rainfall (around 0.03 l/(s·m²), ie about 300 l/s/ha).
- Municipal afkoppel- and subsidy rules usually express berging as mm over the afgekoppelde m² (often 20 to 60 mm); the team's figure should come from the regulation that applies in Deventer.
