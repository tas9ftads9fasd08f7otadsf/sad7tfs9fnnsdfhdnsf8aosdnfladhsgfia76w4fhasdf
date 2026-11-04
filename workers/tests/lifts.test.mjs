import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { railLayers } from "../../poc/web/packages.js";
import { LIFT_CABINS, LIFT_CHAIRS } from "../../poc/web/lifts.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
});
const byId = (id, layers = style.layers) => layers.find((l) => l.id === id);

// 447 Mapy tells lifts apart: a railway-like band for cabins, bold dashes for chairs
test("cabin lifts are a dark band with light dashes, chairs and drag lifts dashed", () => {
  const casing = byId("aerialway-casing");
  const cabin = byId("aerialway");
  assert.ok(JSON.stringify(casing.filter).includes("gondola"));
  assert.equal(casing.paint["line-dasharray"], undefined);
  assert.ok(cabin.paint["line-dasharray"]);
  assert.notEqual(cabin.paint["line-color"], casing.paint["line-color"]);
  assert.ok(style.layers.indexOf(casing) < style.layers.indexOf(cabin));
  assert.ok(JSON.stringify(byId("aerialway-chair").filter).includes("chair_lift"));
  assert.ok(byId("aerialway-chair").paint["line-dasharray"]);
  assert.ok(byId("aerialway-drag").paint["line-dasharray"]);
  assert.equal(LIFT_CABINS.some((k) => LIFT_CHAIRS.includes(k)), false);
});

// 447 the railways package draws the same lifts the same way
test("the railways package draws lifts with the same pattern", () => {
  const layers = railLayers(false).ground;
  for (const id of ["pkg-rail-lift-cabin-casing", "pkg-rail-lift-cabin", "pkg-rail-lift-chair", "pkg-rail-lift"]) {
    assert.ok(byId(id, layers), id);
  }
  assert.ok(byId("pkg-rail-lift-cabin", layers).paint["line-dasharray"]);
  assert.ok(byId("pkg-rail-lift-chair", layers).paint["line-dasharray"]);
});
