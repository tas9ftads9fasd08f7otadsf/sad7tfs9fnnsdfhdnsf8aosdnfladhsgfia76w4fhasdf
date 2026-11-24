# Our map after Mapy.com

What each element looks like on Mapy.com outdoor, from which zoom, and whether ours follows it.
The reference is the outdoor map's `256@2x` tile at Mapy zoom `z`; our style draws the same
area at style zoom `z − 1` (the app shows style zoom). Zooms below are **Mapy's**; the style
column is ours.

How to compare: `.claude/skills/mapy-restyle/SKILL.md`. Colours alone: [coloring.md](coloring.md).

## Places to compare

| Place | lat, lon | What is there |
|---|---|---|
| Plavecké Podhradie | 48.46239, 17.26048 | CHKO Malé Karpaty border, NPR Roštún, forest edges, a village |
| Záhorie, Plavecký Mikuláš | 48.476, 17.268 | military district, CHA, Ramsar site, Rudava |
| Bratislava, Staré Mesto | 48.1437, 17.1077 | town centre, streets, buildings, tram |

## Elements

| Element | Mapy.com | Style | Ours | Ticket |
|---|---|---|---|---|
| CHKO, national park | none at z12; from z13 a solid band ~20–22 px inside the border, pale green `#a9c487` over open land, crisp edges | `park` from z12 | follows (`park_border` line layer from `workers/tiles/park-border.py`) | 564 |
| Reserves (NPR, PR, PP, CHA) | from z14 a 2.5–4 px line `#90b862` with short ticks pointing inside, one every ~13 px at z14 and ~22 px at z16 | `park-outline`, `park-outline-teeth` from z13 | follows | 564 |
| Natura 2000, buffer zones | not drawn | — | not drawn | 544 |
| Protected-area name | `CHKO …` in green italics along the area | `park-name`, `park-area-name` | follows | |
| Valley names | from z14, once along the valley, lower-case italics in dark brown `#453833`, letters well apart, bending with the valley | `names-valley-line` (`line-center`), `names-valley` for points, from z13 | follows; the names package keeps a valley's line 128 px past each tile edge | 566 |
| Military district | forest and fields as they are, a grey outline; shooting ranges grey areas with a letter | `landuse-military` | a flat tan fill over everything | to do |
| Contours | from z13 | contour layers | follows | |
| Paths, tracks, local trails | from z12 | road and trail layers | follows | |
| Memorials, graves | none at z15 | POI | follows | |

Add a row for each element you compare, followed or not; "to do" rows are the next work.
