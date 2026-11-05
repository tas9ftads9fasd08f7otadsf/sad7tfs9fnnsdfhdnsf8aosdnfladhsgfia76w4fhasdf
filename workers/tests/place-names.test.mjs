import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { regionStyle } from "../../poc/web/region-style.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const styleOf = (namesUrl) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  waterUrl: "https://x/water.pmtiles",
  namesUrl
});

// 463 Mapy names ranges (Slanské vrchy), basins and valleys; OpenMapTiles has none of them
test("ranges, basins and valleys are named from the names package", { skip: !spec && NEEDS_SPEC }, () => {
  const style = styleOf("https://x/names.pmtiles");
  const byId = (id) => style.layers.find((l) => l.id === id);
  assert.equal(style.sources.names.type, "vector");
  for (const [id, layer] of [["names-range", "mountain"], ["names-plain", "plain"], ["names-valley", "valley"]]) {
    assert.equal(byId(id).source, "names", id);
    assert.equal(byId(id)["source-layer"], layer, id);
  }
  assert.ok(byId("names-range").minzoom <= 8);
  assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
  assert.equal(styleOf(null).layers.some((l) => l.source === "names"), false);
});

// 463 the region's names archive reaches the style
test("a region with a names archive gets the names source", () => {
  const manifest = { regions: { r: { name: "R", pmtiles: "tiles/r.pmtiles", names: "tiles/r-names.pmtiles" } } };
  const style = regionStyle({ manifest, regionKey: "r", baseUrl: "https://x", set: null, overrides: null,
    theme: "svetla", mapType: "turisticka", languages: ["sk"] });
  assert.ok(style.sources.names.url.endsWith("r-names.pmtiles"));
});

// 463 Mapy names rivers such as the Sekčov and Svinka from its z10
test("river names start at z9", () => {
  const style = styleOf(null);
  assert.ok(style.layers.find((l) => l.id === "water-pkg-river-name").minzoom <= 9);
});
