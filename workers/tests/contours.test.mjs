import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, CONTOUR_MIN_Z, CONTOUR_LABEL_MIN_Z } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  contoursUrl: "https://x/contours.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);
const drawn = (id, properties) => spec.expression.createExpression(byId(id).filter).value
  .evaluate({ zoom: 15 }, { type: "LineString", properties });

// 570 Mapy draws a line every 10 m and a stronger one every 50 m; ours drew every 5 m
test("contours are drawn every 10 m, every 50 m as index lines, never at 5 m", { skip: !spec && NEEDS_SPEC }, () => {
  assert.equal(drawn("contour-minor", { ele: 520, level: "minor" }), true);
  assert.equal(drawn("contour-minor", { ele: 525, level: "minor" }), false, "5 m");
  assert.equal(drawn("contour-minor", { ele: 525, level: "mid" }), false, "25 m");
  assert.equal(drawn("contour-minor", { ele: 550, level: "major" }), false, "an index line");
  assert.equal(drawn("contour-major", { ele: 550, level: "major" }), true);
  assert.equal(drawn("contour-major", { ele: 550, level: "mid" }), true, "a 10 m archive calls 550 mid");
  assert.equal(drawn("contour-major", { ele: 520, level: "minor" }), false);
  assert.equal(style.layers.some((l) => l.id === "contour-mid"), false);
  assert.equal(byId("contour-minor").minzoom, CONTOUR_MIN_Z);
  assert.equal(CONTOUR_MIN_Z, 12, "Mapy's z13");
});

// 570 Mapy names the index lines only, its heights' top uphill; ours named every 25 m, upright
test("heights name the index lines, their top uphill on turned lines", { skip: !spec && NEEDS_SPEC }, () => {
  for (const id of ["contour-label", "contour-label-upright"]) {
    assert.equal(drawn(id, { ele: 525, level: "mid" }), false, `${id} 25 m`);
    assert.equal(byId(id).minzoom, CONTOUR_LABEL_MIN_Z);
  }
  assert.equal(drawn("contour-label", { ele: 550, uphill: 1 }), true);
  assert.equal(drawn("contour-label", { ele: 550 }), false, "an old tile's line runs the other way");
  assert.equal(drawn("contour-label-upright", { ele: 550 }), true);
  assert.equal(byId("contour-label").layout["text-keep-upright"], false, "top uphill, as the line runs");
  assert.equal(byId("contour-label-upright").layout["text-keep-upright"], true);
});
