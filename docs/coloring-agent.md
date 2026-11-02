# Coloring agent – instructions

Paste this file (or point the agent at it) to start an agent that colours our map after a
reference provider. How the tool works is in [coloring.md](coloring.md).

## Task

Make our default map (theme `svetla`) look like Mapy.com outdoor, tile by tile and zoom by zoom.
Change only colours. Shapes, widths, icons, labels and which layers are drawn are not your job.

## Setup

```bash
export COLORING_SITE=https://<user>.github.io/<repo>   # the deployed viewer, ask the owner
export MAPY_API_KEY=<key>                              # ask the owner; never write it into a file
```

Playwright with Chromium must be installed (`require("playwright")` must work). Run everything
from the repository root. Book a ticket first (draft PR), as `CLAUDE.md` says.

## Where to start

Ask the owner for the region and the zooms, or take these: a town centre, a forest, a meadow,
a lake and a mountain area of the deployed region, each at reference zooms 12, 14 and 16
(style zooms 11, 13 and 15). Find a tile for a place with:

```bash
node -e "import('./poc/web/coloring-core.js').then(m => console.log(m.tileKey(m.tileAt(11.40, 47.265, 16))))"
```

## Loop for one tile

1. `node workers/tools/coloring.mjs tile <z>/<x>/<y>` – read the JSON it prints.
2. Open both PNGs it names and look at them side by side. Note what is the same thing on both:
   forest, meadow, water, buildings, roads, paths, railways, built-up areas.
3. For each item in `differ` (largest `share` first):
   - Check on the images that `ref` really is that item's colour. A median pixel can fall on a
     label, a road or hillshade on the reference; then read the colour off the reference image
     yourself, in the middle of a plain area of that item.
   - Skip it if the reference draws a different thing there, or nothing like it.
   - The difference is the same on every zoom and the item has a `paletteKey` →
     `set --palette=<key> --color=<hex>` (every layer of that key, all zooms).
   - Otherwise colour the layer at this zoom only →
     `set --layer=<layer> --prop=<prop> --color=<hex>`.
4. `node workers/tools/coloring.mjs show` and look again. Repeat 3 until `matches` is true or what
   is left isn't a colour problem.
5. `node workers/tools/coloring.mjs done`, then `next` (next tile at the same zoom) or
   `tile <z>/<x>/<y>` (another place or zoom).

## Rules

- Our pixel is not the style colour: hillshade and opacity darken it. Compare `ours` with `ref`,
  but set the colour you want the style to have; check with `show`.
- A palette key changes many layers at once. After a palette change, `show` one tile of each
  other area you already did and make sure it still matches.
- Roads and paths: match the fill, keep casings darker than fills, so roads stay readable.
- Labels and icons (`symbols` in the report) are not compared by pixel; leave them unless the
  owner asks.
- Keep forest the only saturated green and water clearly blue, even where the reference differs.
- Don't edit `poc/web/style-overrides.json` by hand; only `save` writes it.
- Stop and ask the owner when a change would make another area worse and you can't resolve it.

## Finish

1. `node workers/tools/coloring.mjs save` – writes `poc/web/style-overrides.json`; read the lines
   it prints about colours the dark theme can't keep and mention them in the PR.
2. Run the checks from `CLAUDE.md` (`workers/styles/overrides.mjs` already validated the file).
3. Commit `poc/web/style-overrides.json` only (`coloring/` is git-ignored), push, and open the PR
   with the tiles you matched and anything you skipped and why.
