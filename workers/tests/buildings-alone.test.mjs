import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, BUILDINGS_ALONE_FROM_Z } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));

const styleOf = (buildingsUrl, theme = "svetla") => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  buildingsUrl,
  overrides: normalizeOverrides(saved).overrides
});
const stops = (expr) => Object.fromEntries(
  expr.slice(3).reduce((out, v, i) => (i % 2 ? out[out.length - 1].push(v) : out.push([v]), out), []));

// 500 TestFlight AJpg: a ring of land drawn around every house read as a circle, not a yard
test("no ring is drawn around a building, at any zoom", () => {
  for (const url of [null, "https://x/buildings.pmtiles"]) {
    const rings = styleOf(url).layers.filter((l) => l["source-layer"] === "building" && l.type === "line");
    assert.deepEqual(rings.map((l) => l.id), []);
  }
});

// 500 the buildings package draws its houses, nothing around them
// 534 by night; by day Mapy's light ground stays under the houses, so only the overview area fades
test("close up the buildings alone show where people live, at night", () => {
  const { layers } = styleOf("https://x/buildings.pmtiles", "tmava");
  const byId = (id) => layers.find((l) => l.id === id);
  assert.equal(byId("building-pkg").type, "fill");
  for (const id of ["landuse-residential", "settlement-area"]) {
    const opacity = stops(byId(id).paint["fill-opacity"]);
    assert.equal(opacity[BUILDINGS_ALONE_FROM_Z], 0, id);
    assert.ok(opacity[BUILDINGS_ALONE_FROM_Z - 1] > 0, id);
  }
});

// 534 Mapy's z16–z18 villages stand on a light peach (#f2e6d6), ours on the paper's grey-green
test("by day a town's ground stays drawn at every zoom, in a light peach close up", () => {
  const { layers } = styleOf("https://x/buildings.pmtiles", "svetla");
  const ground = layers.find((l) => l.id === "landuse-residential");
  assert.equal(ground.paint["fill-opacity"], undefined, "no fade");
  const overview = stops(layers.find((l) => l.id === "settlement-area").paint["fill-opacity"]);
  assert.equal(overview[BUILDINGS_ALONE_FROM_Z], 0, "the overview area still hands over to the ground");
  const colour = ground.paint["fill-color"];
  assert.equal(colour[0], "step");
  assert.match(colour[colour.length - 1], /^#(ef|f0|f1|f2)[0-9a-f]{2}[cd][0-9a-f]$/i);
});
