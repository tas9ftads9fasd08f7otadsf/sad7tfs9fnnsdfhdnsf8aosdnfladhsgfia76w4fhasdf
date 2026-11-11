import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, CONTOUR_LABEL_SPACING } from "../../poc/web/themes.js";
import { OVERVIEW_DETAIL_Z } from "../../poc/web/map-types.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  contoursUrl: "https://x/contours.pmtiles",
  pointsUrl: "https://x/points.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 477 Mapy at z12-z15: no trail halo, contours from its z13, few height labels
test("the trail halo and index contours wait, height labels are sparse", () => {
  assert.ok(byId("trail-halo").minzoom >= OVERVIEW_DETAIL_Z + 2);
  assert.ok(byId("contour-major").minzoom >= OVERVIEW_DETAIL_Z + 1);
  assert.equal(byId("contour-label").layout["symbol-spacing"], CONTOUR_LABEL_SPACING);
  assert.ok(CONTOUR_LABEL_SPACING >= 600);
});

// 477 memorials and graves crowded town centres at Mapy's z15
test("memorials and graves show only at street level", { skip: !spec && NEEDS_SPEC }, () => {
  const filter = spec.featureFilter(byId("feature-point").filter);
  const at = (zoom, cls) => filter.filter({ zoom }, { type: 1, properties: { class: cls } });
  assert.equal(at(15, "memorial"), false);
  assert.equal(at(16, "memorial"), true);
  assert.equal(at(15, "tomb"), false);
  assert.equal(at(13, "spring"), true);
});
