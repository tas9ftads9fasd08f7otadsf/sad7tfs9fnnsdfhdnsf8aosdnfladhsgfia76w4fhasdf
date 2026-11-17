import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, ROAD_NAME_MAIN_FROM_Z, ROAD_NAME_MINOR_FROM_Z } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const index = (id) => style.layers.findIndex((l) => l.id === id);
const named = (id, cls) => spec.featureFilter(byId(id).filter).filter({ zoom: 16 }, { type: "LineString", properties: { class: cls } });

// 546 Mapy shows no street name at its z15 but a main road's, and the rest from its z16; ours named them all from z13
test("a main road is named from z14 and a minor street from z15", () => {
  assert.equal(byId("road-name-main").minzoom, ROAD_NAME_MAIN_FROM_Z);
  assert.equal(byId("road-name").minzoom, ROAD_NAME_MINOR_FROM_Z);
  assert.ok(ROAD_NAME_MAIN_FROM_Z < ROAD_NAME_MINOR_FROM_Z);
  assert.ok(ROAD_NAME_MAIN_FROM_Z >= 14);
});

test("each road is named by one layer", { skip: !spec && NEEDS_SPEC }, () => {
  for (const cls of ["motorway", "trunk", "primary", "secondary", "tertiary"]) {
    assert.ok(named("road-name-main", cls), cls);
    assert.ok(!named("road-name", cls), `${cls} not twice`);
  }
  for (const cls of ["minor", "service", "track", "path"]) {
    assert.ok(named("road-name", cls), cls);
    assert.ok(!named("road-name-main", cls), `${cls} not twice`);
  }
});

test("both street-name layers keep the same look and sit between the points of interest and the places", () => {
  const [a, b] = [byId("road-name"), byId("road-name-main")];
  assert.deepEqual(a.layout, b.layout);
  assert.deepEqual(a.paint, b.paint);
  for (const poi of style.layers.filter((l) => /^poi-/.test(l.id))) {
    assert.ok(index("road-name") > index(poi.id) && index("road-name-main") > index(poi.id), poi.id);
  }
  for (const id of ["place-city", "place-village", "mountain-peak"]) {
    assert.ok(index(id) > index("road-name-main"), id);
  }
  assert.ok(index("road-name-main") > index("road-name"), "a main road's name is placed before a minor street's");
});

// 546 once a minor street no longer takes the room at z14, a pub took it from the 503 shield; Mapy keeps the number
test("a road shield is placed over the points of interest and under the street names", () => {
  const shields = style.layers.filter((l) => /^road-shield-/.test(l.id));
  assert.ok(shields.length >= 4);
  for (const shield of shields) {
    for (const poi of style.layers.filter((l) => /^poi-/.test(l.id))) {
      assert.ok(index(shield.id) > index(poi.id), `${shield.id} over ${poi.id}`);
    }
    assert.ok(index(shield.id) < index("road-name"), `${shield.id} under the street names`);
  }
});
