import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, YARD_FROM_Z } from "../../poc/web/themes.js";

const styleOf = (buildingsUrl) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  buildingsUrl
});
const stops = (expr) => Object.fromEntries(
  expr.slice(3).reduce((out, v, i) => (i % 2 ? out[out.length - 1].push(v) : out.push([v]), out), []));

test("close up residential land is the yard around buildings, under the other landuse", () => {
  for (const url of [null, "https://x/buildings.pmtiles"]) {
    const { layers } = styleOf(url);
    const ids = layers.map((l) => l.id);
    const yard = layers.find((l) => l.id === "landuse-residential-yard");
    assert.equal(yard.type, "line");
    assert.equal(yard.source === "buildings", Boolean(url));
    assert.ok(ids.indexOf("landuse-residential-yard") < ids.indexOf("landuse-industrial"));
    assert.equal(stops(yard.paint["line-opacity"])[YARD_FROM_Z], 1);
  }
});

test("the residential polygons give way to the yards at the same zoom", () => {
  const { layers } = styleOf("https://x/buildings.pmtiles");
  for (const id of ["landuse-residential", "settlement-area"]) {
    const opacity = stops(layers.find((l) => l.id === id).paint["fill-opacity"]);
    assert.equal(opacity[YARD_FROM_Z], 0, id);
    assert.ok(opacity[YARD_FROM_Z - 1] > 0, id);
  }
});

test("villages are a solid built-up area up to Mapy's z15, yards only from its z16", () => {
  assert.equal(YARD_FROM_Z, 15);
  const { layers } = styleOf("https://x/buildings.pmtiles");
  const opacity = stops(layers.find((l) => l.id === "settlement-area").paint["fill-opacity"]);
  assert.ok(opacity[YARD_FROM_Z - 1] >= 0.8);
});
