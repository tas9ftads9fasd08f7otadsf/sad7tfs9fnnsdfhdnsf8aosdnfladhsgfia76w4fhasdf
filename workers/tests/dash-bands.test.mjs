import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, cleanDash, normalizeOverrides } from "../../poc/web/themes.js";
import { dashValue } from "../../poc/web/patterns.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

const styleWith = (overrides) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides
});

test("dash bands become a zoom step, solid as a dash with no gap", () => {
  assert.deepEqual(dashValue([[0, 12, "solid"], [13, 24, "dashed"]]),
    ["step", ["zoom"], ["literal", [1, 0]], 13, ["literal", [4, 2]]]);
  assert.equal(dashValue([[0, 12, "solid"], [13, 24, "solid"]]), null);
  assert.deepEqual(dashValue("dashed"), [4, 2]);
});

test("cleanDash keeps presets and contiguous bands, refuses the rest", () => {
  const problems = [];
  assert.equal(cleanDash("dotted", problems, "x"), "dotted");
  assert.deepEqual(cleanDash([[0, 12, "solid"], [13, 24, "dashed"]], problems, "x"),
    [[0, 12, "solid"], [13, 24, "dashed"]]);
  assert.equal(cleanDash([[0, 24, "dashed"]], problems, "x"), "dashed");
  assert.deepEqual(problems, []);
  assert.equal(cleanDash([[0, 10, "solid"], [12, 24, "dashed"]], problems, "x"), undefined);
  assert.equal(cleanDash([[0, 24, "wavy"]], problems, "x"), undefined);
  assert.equal(cleanDash([[3, 1, "solid"]], problems, "x"), undefined);
  assert.equal(problems.length, 3);
});

test("a trail dashed on paths from z13 is a path variant with a zoom step", { skip: !spec && NEEDS_SPEC }, () => {
  const bands = [[0, 12, "solid"], [13, 24, "dashed-fine"]];
  const { overrides, problems } = normalizeOverrides({
    maps: { turisticka: { layers: {
      "trail-hiking": { variants: [{ attr: "way", values: ["path"], dash: bands }] },
      "road-path": { dash: bands }
    } } },
    trails: { types: { bicycle: { dash: [[0, 13, "dashed"], [14, 24, "solid"]] } } }
  });
  assert.deepEqual(problems, []);
  const style = styleWith(overrides);
  const byId = Object.fromEntries(style.layers.map((l) => [l.id, l]));
  const pathVariant = style.layers.find((l) => l.id.startsWith("trail-hiking__var"));
  assert.ok(pathVariant, "path variant of trail-hiking");
  assert.deepEqual(pathVariant.paint["line-dasharray"], dashValue(bands));
  assert.equal(byId["trail-hiking"].paint["line-dasharray"], undefined);
  assert.deepEqual(byId["road-path"].paint["line-dasharray"], dashValue(bands));
  assert.deepEqual(byId["trail-bicycle"].paint["line-dasharray"],
    ["step", ["zoom"], ["literal", [4, 2]], 14, ["literal", [1, 0]]]);
  if (spec) assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});
