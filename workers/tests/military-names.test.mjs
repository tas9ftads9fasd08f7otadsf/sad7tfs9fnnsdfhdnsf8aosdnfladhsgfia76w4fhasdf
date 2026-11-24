import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, THEMES, MILITARY_NAME_MIN_Z } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  boundariesUrl: "https://x/boundaries.pmtiles",
  featuresUrl: "https://x/features.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);
const shown = (id, properties) => spec.expression.createExpression(byId(id).filter).value
  .evaluate({ zoom: 12 }, { type: "Point", properties });

// 568 Mapy names the Záhorie military district in grey from its z11; we wrote only "Záhorie"
test("a military district is named in grey, not as a municipality", { skip: !spec && NEEDS_SPEC }, () => {
  const district = { admin_level: 8, landuse: "military", name: "Záhorie (vojenský obvod)" };
  assert.equal(shown("military-name", district), true);
  assert.equal(shown("boundary-name-municipality", district), false, "named once");
  assert.equal(shown("boundary-name-municipality", { admin_level: 8, name: "Jur" }), true);
  assert.equal(shown("military-name", { admin_level: 8, name: "Jur" }), false);
  assert.equal(byId("military-name").paint["text-color"], THEMES.svetla.militaryText);
  assert.equal(THEMES.svetla.militaryText, "#999999");
  assert.equal(byId("military-name").minzoom, MILITARY_NAME_MIN_Z);
  assert.equal(MILITARY_NAME_MIN_Z, 10, "Mapy's z11");
});

// 568 Mapy writes the ranges' letters B and C in the district; we had no label for them
test("a military range is labelled by its letter", { skip: !spec && NEEDS_SPEC }, () => {
  const range = byId("military-range-name");
  assert.equal(range.source, "features");
  assert.equal(shown("military-range-name", { class: "military_range", ref: "B", name: "B" }), true);
  assert.equal(shown("military-range-name", { class: "parking" }), false);
  assert.deepEqual(range.layout["text-field"].slice(0, 2), ["coalesce", ["get", "ref"]]);
});

// 568 the peaks inside range B took its place; Mapy shows the letter, not them
test("military labels are placed before peaks and places", () => {
  const at = (id) => style.layers.findIndex((l) => l.id === id);
  for (const id of ["military-name", "military-range-name"]) {
    assert.ok(at(id) > at("mountain-peak"), id);
    assert.ok(at(id) > at("place-village"), id);
  }
});
