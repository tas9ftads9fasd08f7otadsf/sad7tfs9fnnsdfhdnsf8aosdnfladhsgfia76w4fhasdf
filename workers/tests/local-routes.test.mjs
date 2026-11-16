import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, TRAIL_LOCAL_DASH, TRAIL_STRIPE_WALK } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const build = (overrides) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides
});
const style = build(normalizeOverrides(saved).overrides);
const byId = (id) => style.layers.find((l) => l.id === id);

const widthAt = (stops, z) => {
  const i = stops.findIndex(([sz]) => sz >= z);
  if (stops[i][0] === z) return stops[i][1];
  const [[z0, v0], [z1, v1]] = [stops[i - 1], stops[i]];
  return v0 + ((1.5 ** (z - z0) - 1) / (1.5 ** (z1 - z0) - 1)) * (v1 - v0);
};
const dashAt = (z) => TRAIL_LOCAL_DASH.filter(([from]) => from <= z).pop()[1];

// 529 Mapy draws a local hiking route (`tier: local`, ref ends in M) dashed, in CSS px at our zoom
test("a local hiking route is dashed as long as Mapy's at z13–z16", () => {
  const mapy = { 13: [5.9, 4.5], 14: [9.5, 4.75], 15: [10, 4.75], 16: [10.25, 4.75] };
  for (const [z, expected] of Object.entries(mapy)) {
    const w = widthAt(TRAIL_STRIPE_WALK, Number(z));
    dashAt(Number(z)).forEach((d, i) => {
      assert.ok(Math.abs(d * w - expected[i]) / expected[i] <= 0.15, `z${z} part ${i}: ${(d * w).toFixed(2)}`);
    });
  }
});

test("local routes have a dashed layer of their own, which keeps the hiking routes' override", () => {
  const local = byId("trail-hiking-local");
  assert.equal(local.paint["line-dasharray"][0], "step");
  assert.equal(local.metadata["frico:derived"], "trail-hiking");
  assert.equal(local.metadata["frico:twin"], "trail-hiking");
  assert.deepEqual(local.paint["line-color"], byId("trail-hiking").paint["line-color"]);
  assert.deepEqual(local.paint["line-width"], byId("trail-hiking").paint["line-width"]);
  assert.deepEqual(local.paint["line-offset"], byId("trail-hiking").paint["line-offset"]);
  const own = build(normalizeOverrides({
    layers: { "trail-hiking": { paint: { "line-opacity": 0.4 }, dash: "dotted" } }
  }).overrides);
  const twin = own.layers.find((l) => l.id === "trail-hiking-local");
  assert.equal(twin.paint["line-opacity"], 0.4);
  assert.equal(twin.paint["line-dasharray"][0], "step");
});

test("each hiking route is drawn by exactly one layer", { skip: !spec && NEEDS_SPEC }, () => {
  const drawnBy = (props) => ["trail-hiking", "trail-hiking-local", "trail-hiking-educational"]
    .filter((id) => spec.featureFilter(byId(id).filter)
      .filter({ zoom: 14 }, { type: 2, properties: { route: "hiking", ...props } }));
  assert.deepEqual(drawnBy({ tier: "regional" }), ["trail-hiking"]);
  assert.deepEqual(drawnBy({ tier: "national" }), ["trail-hiking"]);
  assert.deepEqual(drawnBy({ tier: "local" }), ["trail-hiking-local"]);
  assert.deepEqual(drawnBy({ tier: "local", edu: 1 }), ["trail-hiking-educational"]);
  assert.deepEqual(drawnBy({ tier: "regional", edu: 1 }), ["trail-hiking-educational"]);
});
