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
| CHKO, national park | from z13 a soft, see-through band inside the border, ~14 px at z13, ~18 px at z15, ~12 px at z17.5: a stronger green, then a paler one | `park`, `park-fade` from z12, 55–60 % opacity, blur 4 px far out | follows | 564, 574 |
| Reserves (NPR, PR, PP, CHA) | from z14 a 2.5–4 px line `#90b862` with short ticks pointing inside, one every ~13 px at z14 and ~22 px at z16 | `park-outline`, `park-outline-teeth` from z13 | follows | 564 |
| Natura 2000, buffer zones | not drawn | — | not drawn | 544 |
| Protected-area name | `CHKO …` in green italics along the area | `park-name`, `park-area-name` | follows | |
| Valley names | from z14, once along the valley, lower-case italics in dark brown `#453833`, letters well apart, bending with the valley | `names-valley-line` (`line-center`), `names-valley` for points, from z13 | follows; the names package keeps a valley's line 128 px past each tile edge | 566 |
| Military district | no fill: the land shows; a light grey wash to z13; a grey translucent band inside the border, 7 px at z12, 20 px at z14, 30 px at z16 (2×); shooting ranges paler grey with a letter | `landuse-military` to z12, `military-band` | follows; the district's name and the range letters too (568) | 567 |
| Contours | from z13 a faint line every 10 m, every 50 m a stronger one named in bold dark green-grey, its top uphill; no 5 m lines | `contour-minor` from z12, `contour-major`, `contour-label` from z13 | follows; old archives keep upright heights (`contour-label-upright`) | 570 |
| Hill shading | dark green-grey shadows far out (5th percentile of forest luminance 143 at z13, 152 at z14), lighter close up (171 at z15) | `hillshade`, palette `hillShadow` | follows within ~5 levels | 571 |
| Railway | grey `#717170` band with white dashes in its middle, dash = gap ≈ 4× dash width; ~4 px at z12, ~2.5 px per track at z14, ~4.5 px at z16 | `rail-bg`, `rail-hatch` (dash `rail-centre`) | follows | 575 |
| Road numbers | motorways and first- and second-class roads numbered; third-class roads (four digits) never | `road-shield-*`; hiking map gates `tertiary` off | follows | 576 |
| Vineyards | pale green with small vine icons about 20 px apart from z13 | `landcover-vineyard-icons` from z12, pattern tile 20 px | follows | 577 |
| Paths, tracks, local trails | from z12 | road and trail layers | follows | |
| Memorials, graves | none at z15 | POI | follows | |

Add a row for each element you compare, followed or not; "to do" rows are the next work.
