import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, TUNNEL_OPACITY } from "../../poc/web/themes.js";

const { overrides } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const styleOf = (mapType) => buildStyle({
  theme: "svetla",
  mapType,
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  transportUrl: "https://x/transport.pmtiles",
  overrides
});
const style = styleOf("turisticka");
const byId = (id, s = style) => s.layers.find((l) => l.id === id);
const hidden = (l) => l.layout?.visibility === "none";

// 451 an opaque tunnel read as a road over the mountain (Branisko)
test("tunnels are faded with a dashed casing", () => {
  for (const id of ["motorway", "trunk", "primary"]) {
    assert.equal(byId(`road-${id}-tunnel`).paint["line-opacity"], TUNNEL_OPACITY, id);
    assert.ok(byId(`road-${id}-casing-tunnel`).paint["line-dasharray"], id);
  }
  assert.ok(TUNNEL_OPACITY < 0.6);
  assert.equal(byId("road-primary").paint["line-opacity"], undefined);
});

// 451 the D1 through Branisko is tagged trunk; Mapy draws it green like the motorway
test("a trunk road is drawn in the motorway's colours", () => {
  for (const s of ["", "-bridge", "-tunnel"]) {
    assert.deepEqual(byId(`road-trunk${s}`).paint["line-color"], byId(`road-motorway${s}`).paint["line-color"]);
    assert.deepEqual(byId(`road-trunk-casing${s}`).paint["line-color"],
      byId(`road-motorway-casing${s}`).paint["line-color"]);
  }
});

// 451 limits are the driver's; a municipal border along a street reads as a lane marking
test("the default map hides speed limits and municipal borders, the road map keeps the limits", () => {
  for (const id of ["road-maxspeed", "road-limit-height", "road-limit-mass", "boundary-municipality"]) {
    assert.ok(hidden(byId(id)), id);
  }
  assert.ok(!hidden(byId("road-maxspeed", styleOf("cestna"))));
});
