import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

// 452 place outlines (quarter, suburb, neighbourhood) take in whole wooded hills around Prešov
test("only residential land is filled, not the outline of a city quarter", { skip: !spec && NEEDS_SPEC }, () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
  });
  const filter = spec.featureFilter(style.layers.find((l) => l.id === "landuse-residential").filter);
  const filled = (cls) => filter.filter({ zoom: 14 }, { type: 3, properties: { class: cls } });
  assert.equal(filled("residential"), true);
  for (const cls of ["quarter", "suburb", "neighbourhood"]) assert.equal(filled(cls), false, cls);
});
