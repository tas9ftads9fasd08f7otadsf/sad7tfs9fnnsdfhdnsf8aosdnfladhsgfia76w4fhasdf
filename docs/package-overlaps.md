# Package overlaps: which OSM objects two packages both draw

Packages are meant to be disjoint, so that switching one off takes its objects off the map and
switching two on draws nothing twice. `workers/tools/overlap.py` checks it: it reads every
archive of a built `_site/tiles`, knows each feature by its OSM object (Planetiler's tile id is
the OSM id × 10 + 1 node, 2 way, 3 relation, in our schemas and in the base map's cuts alike),
maps each file to its package by the `suffixes` of `config/packages.json`, and lists the
objects two packages share, by what each package makes of them.

    python3 workers/tools/overlap.py --tiles=_site/tiles --rows=6 --out=overlap.md

Measured on 2026-11-05 on a cut-out of Prešovský kraj (19.95–20.40 E, 49.00–49.25 N: the High
Tatras, Štrbské Pleso, Poprad), every package built by its own `build.sh` and the base map cut
by `workers/tiles/cut.py`. The tables per pair are in
[package-overlaps-tatry.md](package-overlaps-tatry.md). Waymarked trails are not compared: their
features carry no OSM id.

## The same thing drawn twice

| Objects | Packages | What |
|---:|---|---|
| ~600 peaks, 371 saddles, 108 ridges | Landscape, Points, Geographical names | a peak is OpenMapTiles' `mountain_peak` (Landscape's cut), `peak` in `points.yml`, and `mountain` in `names.yml` |
| 206 | Points, Water bodies | springs: `feature_point:spring` and `water_point:spring` |
| 184 | Landscape, Ski & winter | pistes: `features.yml` keeps `piste` lines, `ski.yml` has them too |
| ~80 lifts, 44 stations | Railways, Ski & winter, Paths, Points | a lift is `aerialway` in `rail.yml`, `transportation:aerialway` in the Railways cut, a line in `paths.yml`, `lift` in `ski.yml`; its station also a `poi:aerialway` |
| 63 | Settlements, Boundaries, Geographical names | place names: the base map's `place`, the buildings archive's `settlement`, `place` in `boundaries.yml`, and `names.yml` (the app keeps one of Settlements and Geographical names since rikimaps#2794; Boundaries' still draws) |
| 363 | Army & history, Points | memorials, adits, wayside crosses and shrines are `history` and `feature_point` |
| 101 embankments, 40 quarries | Army & history, Landscape | `embankment` in `history.yml` and `feature_line:embankment`; quarries also `landuse:quarry` |
| 39 | Railways, Points | stations and halts: `station` and the base map's `poi:railway` |
| 32 | Army & history, Railways | disused and abandoned railways in `gone` and in `rail.yml` |
| 39 | Paths, Railways | platforms: the base map's `transportation:path` and `railway:platform` |
| 81 | Roads, Paths | names of paths and lifts: `cut.py` gives the whole `transportation_name` layer to Roads, so a path's name is Roads' and Paths draw it unnamed when Roads are off |
| 55 | Landscape, Settlements | residential, commercial and retail landuse, and the built-up area `settlement_area` |
| 23, 9 | Points, Water bodies / Ski & winter | swimming pools; ski areas as a `poi:winter_sports` |

## One object, different things – no change needed

| Objects | Packages | What |
|---:|---|---|
| 25 682 | Roads, Settlements | a building's house number (`housenumber`, `addresses`) and the building |
| 545 | Points, Settlements | a hotel's, church's or shelter's icon on its building |
| 1 342, 251, 111 | Landscape, Points | a car park's, pitch's or playground's area and its icon |
| 13 | Roads, Ski & winter | a track or service road that is a piste in winter |
| 13 | Roads, Army & history | `embankment=yes` on a road |

## What to change, one owner per thing

Proposals, each a ticket of its own:

- **Peaks, saddles, ridges**: Geographical names names them, Landscape draws the mark; `points.yml`
  drops `peak` and `saddle`.
- **Springs**: Water bodies; `points.yml` drops `natural=spring`.
- **Pistes**: Ski & winter; `features.yml` drops `piste`.
- **Lifts and stations**: Ski & winter for those that serve skiing (`drag_lift`, `t-bar`,
  `platter`, `chair_lift`…), Railways for cable cars and gondolas; `paths.yml` and the base map's
  `poi:aerialway` drop them.
- **Place names**: `boundaries.yml` drops `place`.
- **Memorials, adits, wayside crosses, embankments, quarries**: Army & history; `points.yml` and
  `features.yml` drop them.
- **Stations**: Railways; the Points cut drops `poi:railway`.
- **Disused railways**: Railways, which draws them by state already; `history.yml` leaves out
  railways.
- **Path and lift names**: `cut.py` sends `transportation_name` by class as it sends
  `transportation`.
