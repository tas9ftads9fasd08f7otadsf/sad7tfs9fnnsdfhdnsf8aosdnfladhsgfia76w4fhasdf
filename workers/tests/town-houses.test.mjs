import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

// 478 a town house's yard lay on the town's own fill: 2,600 bands a tile that showed nothing
test("the hamlet shading skips houses in built-up land", { skip: !spec && NEEDS_SPEC }, () => {
  const style = buildStyle({ theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/t.pmtiles",
    spriteUrl: "https://x/s", glyphsUrl: "https://x/{fontstack}/{range}.pbf", buildingsUrl: "https://x/b.pmtiles" });
  const filter = spec.featureFilter(style.layers.find((l) => l.id === "settlement-yard").filter);
  const drawn = (properties) => filter.filter({ zoom: 13 }, { type: 3, properties });
  assert.equal(drawn({ class: "house", in_town: 1 }), false);
  assert.equal(drawn({ class: "house" }), true, "a hamlet's house, or tiles built before the flag");
  assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});
