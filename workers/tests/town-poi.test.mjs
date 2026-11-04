import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { TOWN_POI_Z } from "../../poc/web/map-types.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

const styleOf = (mapType) => buildStyle({
  theme: "svetla",
  mapType,
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
});

const shownAt = (style, id, zoom, properties) => {
  const filter = style.layers.find((l) => l.id === id).filter;
  const parsed = spec.featureFilter(filter);
  return parsed.filter({ zoom }, { type: 1, properties });
};

// 442 the default map keeps town clutter for street level, as Mapy's outdoor map does
test("parking, shops and schools wait for street level on the default map", { skip: !spec && NEEDS_SPEC }, () => {
  const style = styleOf("turisticka");
  const parking = { class: "parking", subclass: "parking", rank: 5 };
  assert.equal(shownAt(style, "poi-road", TOWN_POI_Z - 1, parking), false);
  assert.equal(shownAt(style, "poi-road", TOWN_POI_Z, parking), true);
  assert.equal(shownAt(style, "poi-major", 14, { class: "shop", subclass: "florist", rank: 3 }), false);
  assert.equal(shownAt(style, "poi-major", 14, { class: "school", subclass: "kindergarten", rank: 3 }), false);
});

// 442 what a hiker looks for stays
test("huts, guideposts, water and fuel keep their zoom on the default map", { skip: !spec && NEEDS_SPEC }, () => {
  const style = styleOf("turisticka");
  assert.equal(shownAt(style, "poi-major", 14, { class: "lodging", subclass: "alpine_hut", rank: 3 }), true);
  assert.equal(shownAt(style, "poi-major", 14, { class: "information", subclass: "guidepost", rank: 3 }), true);
  assert.equal(shownAt(style, "poi-road", 14, { class: "drinking_water", subclass: "drinking_water", rank: 3 }), true);
  assert.equal(shownAt(style, "poi-road", 14, { class: "fuel", subclass: "fuel", rank: 3 }), true);
});

// 442 the road map is where parking belongs
test("the road map still shows parking early", { skip: !spec && NEEDS_SPEC }, () => {
  const style = styleOf("cestna");
  assert.equal(shownAt(style, "poi-road", 12, { class: "parking", subclass: "parking", rank: 5 }), true);
});
