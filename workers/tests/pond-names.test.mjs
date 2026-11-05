import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  waterUrl: "https://x/water.pmtiles"
});
const named = (zoom, properties) => {
  const filter = spec.featureFilter(style.layers.find((l) => l.id === "water-pkg-name").filter);
  return filter.filter({ zoom }, { type: 3, properties });
};

// 467 "Rybník Lazy" and "Nádrž Diana" were named at z9, where Mapy names only big lakes
test("a pond is named only close up, a big lake from afar", { skip: !spec && NEEDS_SPEC }, () => {
  const pond = { name: "Rybník Lazy", area_ha: 3 };
  const domasa = { name: "Veľká Domaša", area_ha: 1400 };
  assert.equal(named(9, pond), false);
  assert.equal(named(11, pond), false);
  assert.equal(named(12, pond), true);
  assert.equal(named(8, domasa), true);
  assert.equal(named(12, { name: "Malý rybník", area_ha: 0.6 }), false);
  assert.equal(named(13, { name: "Malý rybník", area_ha: 0.6 }), true);
  assert.equal(named(9, { name: "Stará nádrž" }), true, "tiles without area_ha keep the name");
  assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});

// 467 OSM way 1527443253 is named "pond"; a word for the kind of water is no name
test("a generic word is not shown as a name", { skip: !spec && NEEDS_SPEC }, () => {
  assert.equal(named(14, { name: "pond", area_ha: 1 }), false);
  assert.equal(named(14, { name: "Rybník", area_ha: 1 }), false);
  assert.equal(named(14, { name: "Rybník Lazy", area_ha: 1 }), true);
});

// 467 the water tiles carry each area's size for the style to filter by
test("water areas carry their size in hectares", () => {
  const schema = readFileSync(new URL("../water/water.yml", import.meta.url), "utf8");
  assert.ok(schema.includes("key: area_ha"));
  assert.ok(schema.includes("attributes: *water_area_attrs"));
});
