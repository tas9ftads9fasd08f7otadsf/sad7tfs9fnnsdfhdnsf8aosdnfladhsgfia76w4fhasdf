import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { OVERVIEW_DETAIL_Z } from "../../poc/web/map-types.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const styleOf = (mapType) => buildStyle({
  theme: "svetla",
  mapType,
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  boundariesUrl: "https://x/boundaries.pmtiles"
});
const style = styleOf("turisticka");
const byId = (id, s = style) => s.layers.find((l) => l.id === id);
const shown = (id, zoom, properties) =>
  spec.featureFilter(byId(id).filter).filter({ zoom }, { type: 2, properties });

// 483 long-distance routes alone still covered the overview (TestFlight ABcm)
test("no trail shows below the detail zoom", () => {
  for (const layer of style.layers.filter((l) => l.id.startsWith("trail-"))) {
    assert.ok(layer.minzoom >= OVERVIEW_DETAIL_Z, layer.id);
  }
});

// 476 Mapy names only the main peaks from afar
test("minor peaks wait for the detail zoom", { skip: !spec && NEEDS_SPEC }, () => {
  const peak = (rank, zoom) => spec.featureFilter(byId("mountain-peak").filter)
    .filter({ zoom }, { type: 1, properties: { class: "peak", rank, name: "x" } });
  assert.equal(peak(1, 9), true);
  assert.equal(peak(4, 9), false);
  assert.equal(peak(4, OVERVIEW_DETAIL_Z), true);
});

// 476 paths, tracks, district borders and topic icons aren't on the overview
test("the overview draws no paths, district borders or names, or topic icons", () => {
  for (const id of ["road-path", "road-track", "boundary-district", "trail-halo"]) {
    assert.ok(byId(id).minzoom >= OVERVIEW_DETAIL_Z, id);
  }
  for (const id of ["poi-historic", "poi-mining", "poi-road"]) assert.ok(byId(id).minzoom > OVERVIEW_DETAIL_Z, id);
  for (const id of ["boundary-name-region", "boundary-name-district"]) {
    assert.equal(byId(id).layout.visibility, "none", id);
  }
  assert.ok(byId("road-path", styleOf("zakladna")).minzoom !== undefined);
});

// 476 meadows and fields take the background colour; drawing them only costs time
test("a fill in the background's own colour is not drawn, its coloured variants are", async () => {
  const { readFileSync } = await import("node:fs");
  const { normalizeOverrides } = await import("../../poc/web/themes.js");
  const { overrides } = normalizeOverrides(
    JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
  const s = buildStyle({ theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/t.pmtiles",
    spriteUrl: "https://x/s", glyphsUrl: "https://x/{fontstack}/{range}.pbf", overrides });
  const get = (id) => s.layers.find((l) => l.id === id);
  assert.equal(get("landcover-farmland").layout?.visibility, "none");
  assert.equal(get("landcover-grass").layout?.visibility, "none");
  assert.notEqual(get("landcover-grass__var1").layout?.visibility, "none");
  assert.notEqual(get("landcover-wood").layout?.visibility, "none");
});
