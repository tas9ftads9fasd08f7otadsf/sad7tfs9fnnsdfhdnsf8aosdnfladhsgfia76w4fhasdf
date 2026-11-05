import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, YARD_FROM_Z } from "../../poc/web/themes.js";

// 458 hamlets with no residential polygon in OSM had no built-up area at all
test("houses are shaded as built-up land until the yards take over", () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    buildingsUrl: "https://x/buildings.pmtiles"
  });
  const byId = (id) => style.layers.find((l) => l.id === id);
  const yard = byId("settlement-yard");
  const area = byId("settlement-area");
  assert.equal(yard.source, "buildings");
  assert.equal(yard["source-layer"], "building");
  assert.equal(yard.maxzoom, YARD_FROM_Z);
  assert.equal(yard.paint["line-color"], area.paint["fill-color"]);
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.indexOf("settlement-yard") > ids.indexOf("settlement-area"));
  assert.ok(ids.indexOf("settlement-yard") < ids.indexOf("building-pkg"));
});
