---
name: mapy-restyle
description: "Restyling our map after Mapy.com outdoor, element by element and zoom by zoom — the Mapy key, comparing a place side by side (coloring.mjs compare), finding the layer that draws a thing, changing the style or the pipeline, checking a pipeline change on local tiles before deploy, tests, and docs/mapy-style.md as the record of what already follows Mapy"
---

# Restyling after Mapy.com

Goal: each element of our default map (theme `svetla`, map type `turisticka`) looks as on Mapy.com
outdoor and appears at the same zoom. Colours alone have their own loop
(`docs/coloring-agent.md`); this skill is for everything else too: widths, dashes, ticks,
bands, which zoom an element starts or stops at, and what isn't drawn at all.

## Key and site

- Mapy.com needs a key. The session's environment keeps it as `MAPY_KEY`, or as a network
  secret for `api.mapy.com` that the proxy sends as the `X-Mapy-Api-Key` header. With the
  secret the tool still wants a value: `MAPY_API_KEY=proxy-injected`. Never write the key into
  a file. Check: `curl -s -o /dev/null -w "%{http_code}" "https://api.mapy.com/v1/maptiles/outdoor/256@2x/14/8977/5663"` is 200.
- `COLORING_SITE=https://tas9ftads9fasd08f7otadsf.github.io/sad7tfs9fnnsdfhdnsf8aosdnfladhsgfia76w4fhasdf`,
  the deployed viewer; its tiles are the latest build. `coloring.html` on it is the same
  comparison in a browser.
- Playwright and Chromium must work (`require("playwright")`).

## Zooms and pixels

Mapy's `256@2x` tile at zoom `z` is our style at `z − 1`. The app's debug line shows **style**
zoom: a screenshot at `z 13.2` is Mapy's 14.2. `docs/mapy-style.md` uses Mapy's zooms.
Mapy's tiles are drawn at 2×: a width read off its image in pixels is **half** that in the
style (a 20 px band on Mapy's image is `line-width: 10`). `compare` shoots at 2× too, so the
two halves of its image measure alike.

## Loop for one element

1. **Book** a ticket (CLAUDE.md), one per element or a small batch of related ones.
2. **Compare** a place at three Mapy zooms where the element changes, usually 12, 14 and 16:
   `node workers/tools/coloring.mjs compare <lat>,<lon> <z> --out=<dir>`. It drives the
   prepared comparison page (`coloring.html`, its two synced maps) and shoots them: ours left,
   Mapy right. The same page in a browser, `$COLORING_SITE/coloring.html`, is for looking around
   by hand; send the owner its link with `#tile=<z>/<x>/<y>` for a place. A screenshot from the
   app names its place and zoom.
3. **Find the layer**: the JSON lists every layer our map drew with its classes; then
   `grep -n 'id: "<layer>"' poc/web/themes.js`. Constants for widths and zooms sit near the top
   of `themes.js`, colours in `THEMES.svetla`, map-type differences in `map-types.js`.
4. **Measure Mapy**: crop and enlarge its tile (PIL), read widths in px, colours with
   `getpixel` in a plain spot, spacing of dashes and ticks; note the first zoom it appears.
5. **Change** the style. Check `poc/web/style-overrides.json` for an override of that layer: it
   wins over `themes.js` (`maps.turisticka.layers.<id>`). Remove a stale one with Python
   (`json.dumps(d, indent=2, ensure_ascii=False) + "\n"` keeps the file byte for byte), not
   through `workers/styles/overrides.mjs`, which rewrites unrelated entries.
6. **Pipeline**, when the tiles don't carry what Mapy draws (a layer is cut at the tile buffer,
   a class is missing): change the worker, download the region's archive from
   `$COLORING_SITE/tiles/<region>.pmtiles` into a folder, run the worker on it, and compare with
   `--tiles=<folder>`. A new base-map layer needs `config/packages.json` `base_map.layers`,
   `BASE_CLAIMS` in `poc/web/packages.js` and the app's `MapOverlay.claimedBaseSourceLayers`
   (rikimaps; its own PR), or the cut stops and the app drops it.
7. **Compare again** at the same zooms until it matches or what is left isn't this element.
8. **Tests**: a `node --test` test for the style (what Mapy does, from which zoom) and a
   `unittest` for a worker; each names the ticket. Run `python3 -m unittest discover -s workers/tests`,
   `node --test workers/tests/*.test.mjs` with `STYLE_SPEC_DIR` holding
   `@maplibre/maplibre-gl-style-spec@23.3.0` (a newer spec fails unrelated tests), and
   `workers/lint/*`.
9. **Record** the element in `docs/mapy-style.md`: Mapy's look and zoom, our layer, ticket.
   Put the before/after PNGs in the PR description.

## Pitfalls

- A translucent line darkens where its joins overlap; draw bands opaque.
- A `line` on a polygon layer also draws the polygon's cut edge at the tile buffer (8 px at
  512): anything offset inward wider than that stripes tile seams. Draw it from a line layer
  instead (`park_border` is the example).
- Mapy's labels and icons differ in font; compare their zoom and density, not glyphs.
- `compare` waits for both maps to settle; past the region's edge that takes 15 s.
- A thing Mapy names but we don't: check the package has it (`pmtiles` + `mapbox_vector_tile`
  on the region's archive) before the style; a layer may carry lines the style only reads as
  points (valleys did).
