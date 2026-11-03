import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

const trailStyle = (overrides) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides
});

const offsetOf = (style) =>
  JSON.stringify(style.layers.find((l) => l.id === "trail-hiking").paint["line-offset"]);

test("trails.lanes: colour is kept, route is the default, junk is refused", () => {
  assert.equal(normalizeOverrides({ trails: { lanes: "colour" } }).overrides.trails.lanes, "colour");
  assert.equal(normalizeOverrides({ trails: { lanes: "route" } }).overrides.trails.lanes, undefined);
  const { overrides, problems } = normalizeOverrides({ trails: { lanes: "stacked" } });
  assert.equal(overrides.trails.lanes, undefined);
  assert.equal(problems.length, 1);
});

test("one stripe per colour offsets by `lane`, falling back to `off`", { skip: !spec && NEEDS_SPEC }, () => {
  const perRoute = trailStyle(normalizeOverrides({}).overrides);
  const perColour = trailStyle(normalizeOverrides({ trails: { lanes: "colour" } }).overrides);
  assert.ok(!offsetOf(perRoute).includes('"lane"'));
  assert.ok(offsetOf(perColour).includes('["coalesce",["get","lane"],["get","off"],0]'));
  if (spec) assert.deepEqual(spec.validateStyleMin(perColour).map((e) => e.message), []);
});
