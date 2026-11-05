import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, valueAtZoom } from "../../poc/web/themes.js";

const { overrides, problems } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  contoursUrl: "https://x/contours.pmtiles",
  featuresUrl: "https://x/features.pmtiles",
  overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const L = overrides.maps.turisticka.layers;

// 455 random tiles: Mapy's contours fade into forest close up, orchards stay plain
test("contours fade from z14 and orchards are a plain variant", () => {
  assert.deepEqual(problems, []);
  for (const id of ["contour-minor", "contour-major"]) {
    assert.ok(valueAtZoom(byId(id).paint["line-opacity"], 15) < 1, id);
    assert.equal(valueAtZoom(byId(id).paint["line-opacity"], 12), 1, id);
  }
  assert.ok(L["landcover-garden"].variants.some((v) => v.values.includes("orchard")));
});

// 455 a secondary road has no dark edge at Mapy's z13
test("a secondary road's casing is its own colour at z12", () => {
  const casing = byId("road-secondary-casing").paint["line-color"];
  assert.equal(valueAtZoom(casing, 12), valueAtZoom(byId("road-secondary").paint["line-color"], 12));
  assert.notEqual(valueAtZoom(casing, 14), valueAtZoom(byId("road-secondary").paint["line-color"], 14));
});

// 455 power lines wait for z13 on the default map
test("power lines start at z13 on the default map", () => {
  const power = byId("feature-power");
  assert.ok(power && power.minzoom >= 13);
});
