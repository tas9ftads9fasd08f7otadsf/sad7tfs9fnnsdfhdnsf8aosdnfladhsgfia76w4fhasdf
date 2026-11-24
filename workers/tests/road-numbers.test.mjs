import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const styleOf = (mapType) => buildStyle({
  theme: "svetla",
  mapType,
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
});
const shown = (style, cls, zoom) => {
  const layer = style.layers.find((l) => l.id === "road-shield-secondary");
  const filter = spec.expression.createExpression(layer.filter, spec.latest.filter_symbol);
  return filter.value.evaluate({ zoom }, { type: "LineString", properties: { class: cls, ref: "1083" } });
};

// 576 Mapy numbers no third-class road; ours wrote "1083" in a white box from Mapy's z13
test("the hiking map numbers second-class roads but no third-class ones", { skip: !spec && NEEDS_SPEC }, () => {
  const hiking = styleOf("turisticka");
  for (const z of [13, 16, 20]) {
    assert.equal(shown(hiking, "secondary", z), true, `secondary z${z}`);
    assert.equal(shown(hiking, "tertiary", z), false, `tertiary z${z}`);
  }
  assert.equal(shown(styleOf("cestna"), "tertiary", 13), true, "the road map keeps them");
  assert.deepEqual(spec.validateStyleMin(hiking).map((e) => e.message), []);
});
