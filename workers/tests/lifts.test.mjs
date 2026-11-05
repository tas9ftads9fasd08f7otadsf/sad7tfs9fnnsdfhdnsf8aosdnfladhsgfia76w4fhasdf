import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
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

// 472 lifts in service come from Ski & winter, drawn the same way
test("with Ski & winter the lifts read its archive, those in service only", () => {
  const ski = buildStyle({
    theme: "svetla",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    skiUrl: "https://x/ski.pmtiles"
  });
  for (const id of ["aerialway-casing", "aerialway", "aerialway-chair", "aerialway-drag"]) {
    const layer = byId(id, ski.layers);
    assert.equal(layer.source, "ski", id);
    assert.equal(layer["source-layer"], "lift", id);
    assert.ok(JSON.stringify(layer.filter).includes("active"), id);
    assert.equal(JSON.stringify(layer.paint), JSON.stringify(byId(id).paint), id);
  }
  assert.ok(byId("aerialway-construction", ski.layers) && byId("aerialway-proposed", ski.layers));
  assert.equal(byId("aerialway-construction"), undefined);
});
