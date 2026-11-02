# Tile coloring

Our tile beside a reference provider's (Mapy.com outdoor), and a list of everything drawn on it
with three colours each: the style's, the pixel on our tile and the pixel at the same spot on the
reference. An agent (or a person) changes our colours until the tile looks like the reference,
then moves on. Colours are kept **per zoom**: the same layer may be lighter at z12 than at z16.

- Page: `coloring.html` next to the viewer on Pages (`<site>/coloring.html#tile=16/34843/22979`).
  The API key is typed into the page and stays in that browser; it is never committed.
- CLI for agents: `workers/tools/coloring.mjs` – the same page in headless Chromium.
- Logic: `poc/web/coloring-core.js` (tile math, sampling summary, edits → overrides).

## Zooms

The reference tile is `256@2x` at `z`, i.e. 512 px; our style draws the same area at style zoom
`z − 1`. A colour set on tile `16/…` is stored for style zoom 15. Edited zooms become bands
(`[[from, to, colour], …]`) in `style-overrides.json`; a zoom nobody edited takes the colour of the
nearest edited zoom below it (the lowest band reaches down to z0).

## Agent loop

```bash
export COLORING_SITE=https://<user>.github.io/<repo>   # the deployed viewer
export MAPY_API_KEY=…                                  # never into a file in the repo
node workers/tools/coloring.mjs tile 16/34843/22979
```

Each `tile`, `show` or `next` prints JSON and writes into `coloring/` (git-ignored):

- `<z>-<x>-<y>-ours.png`, `<z>-<x>-<y>-ref.png` – the two tiles, pixel for pixel aligned;
- `<z>-<x>-<y>-report.json` – every item: `layer`, `prop`, `color` (the style's), `ours`, `ref`
  (median pixels), `delta` (CIE76 ΔE), `share` of the tile, `paletteKey`, `classes`; `symbols`
  lists labels and icons, which are compared on the images only;
- `matches: true` once every item over 1 % of the tile is within ΔE 10.

Then, per differing item:

1. Look at both PNGs: is it the same thing on both sides? A pixel under a label or a road on the
   reference is not that item's colour – skip it.
2. Colour one layer at this zoom: `set --layer=<layer> --prop=<prop> --color=<hex>`
   (`--zoom=<style zoom>` for another zoom).
   Colour every layer of a palette key at all zooms: `set --palette=<key> --color=<hex>`; use it
   when the item has a `paletteKey` and the difference is the same on every zoom.
3. `show` draws the tile again with the edits; repeat until `matches`, or until what is left is not
   a colour problem.
4. `done` marks the tile, `next` goes to the region's next tile at the same zoom; change zoom with
   `tile <z>/<x>/<y>`.
5. `save` writes the edits into `poc/web/style-overrides.json` through `workers/styles/overrides.mjs`
   and empties them; commit that file in a PR.

Edits live in `coloring/edits.json` (`--state=` for another file), so several runs or agents can
continue one another's work. The dark theme keeps its own colour: saving writes the dark style's
current colour to `paintDark` where none is set, and names the layers where it can't.

In the page the same is `window.coloring`: `goto(z, x, y)`, `report()`, `set({...})`,
`clear({...})`, `next()`, `edits()`, `loadEdits(json)`, `overrides()`, `images()`, `save()`.
