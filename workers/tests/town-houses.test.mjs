import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

// 478 a town house's yard lay on the town's own fill: 2,600 bands a tile that showed nothing
// 506 since 500 no yards are drawn, so a town house gets only its own fill
test("a town house gets no band on top of the town's fill", { skip: !spec && NEEDS_SPEC }, () => {
  const style = buildStyle({ theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/t.pmtiles",
    spriteUrl: "https://x/s", glyphsUrl: "https://x/{fontstack}/{range}.pbf", buildingsUrl: "https://x/b.pmtiles" });
  const z = 13;
  const house = { type: 3, properties: { class: "house", in_town: 1 } };
  const drawing = style.layers.filter((l) => l["source-layer"] === "building"
    && (l.minzoom ?? 0) <= z && z < (l.maxzoom ?? 24)
    && (!l.filter || spec.featureFilter(l.filter).filter({ zoom: z }, house)));
  assert.deepEqual([...new Set(drawing.map((l) => l.type))], ["fill"]);
  assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});
