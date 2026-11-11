import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, BUILDINGS_ALONE_FROM_Z } from "../../poc/web/themes.js";

const styleOf = (buildingsUrl) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  buildingsUrl
});
const stops = (expr) => Object.fromEntries(
  expr.slice(3).reduce((out, v, i) => (i % 2 ? out[out.length - 1].push(v) : out.push([v]), out), []));

// 500 TestFlight AJpg: a ring of land drawn around every house read as a circle, not a yard
test("no ring is drawn around a building, at any zoom", () => {
  for (const url of [null, "https://x/buildings.pmtiles"]) {
    const rings = styleOf(url).layers.filter((l) => l["source-layer"] === "building" && l.type === "line");
    assert.deepEqual(rings.map((l) => l.id), []);
  }
});

// 500 the buildings package draws its houses, nothing around them
test("close up the buildings alone show where people live", () => {
  const { layers } = styleOf("https://x/buildings.pmtiles");
  const byId = (id) => layers.find((l) => l.id === id);
  assert.equal(byId("building-pkg").type, "fill");
  for (const id of ["landuse-residential", "settlement-area"]) {
    const opacity = stops(byId(id).paint["fill-opacity"]);
    assert.equal(opacity[BUILDINGS_ALONE_FROM_Z], 0, id);
    assert.ok(opacity[BUILDINGS_ALONE_FROM_Z - 1] > 0, id);
  }
});
