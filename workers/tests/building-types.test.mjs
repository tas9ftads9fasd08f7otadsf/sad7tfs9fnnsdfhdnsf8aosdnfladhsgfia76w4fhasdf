import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, THEMES } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides, problems } = normalizeOverrides(saved);
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  buildingsUrl: "https://x/buildings.pmtiles",
  overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const index = (id) => style.layers.findIndex((l) => l.id === id);

// 508 Mapy draws a church grey and a public building pale grey, not like a house
test("churches are grey and public buildings pale grey", () => {
  assert.deepEqual(problems, []);
  const grey = (id) => byId(id).paint["fill-color"];
  assert.equal(grey("building-pkg__var1"), "#a09d95", "class church");
  assert.equal(grey("building-pkg__var2"), "#a09d95", "amenity place_of_worship");
  assert.equal(grey("building-pkg__var3"), "#ececf1", "amenity fire_station and the like");
  assert.match(JSON.stringify(byId("building-pkg__var1").filter), /"church"/);
  assert.match(JSON.stringify(byId("building-pkg__var3").filter), /"fire_station"/);
  assert.match(JSON.stringify(byId("building-pkg").filter), /"church"/, "a house leaves them out");
});

// 508 a shadow to the lower right, under the building it belongs to
test("a building casts a soft shadow to the lower right, under it", () => {
  const shadow = byId("building-shadow");
  assert.equal(shadow.paint["fill-color"], THEMES.svetla.buildingShadow);
  const from = shadow.paint["fill-translate"][4];
  assert.deepEqual(from[1], [1.5, 1.5], "down and right");
  assert.ok(index("building-shadow") < index("building-pkg"));
  assert.equal(shadow.minzoom, 15);
});

test("every theme has a shadow colour", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    if (theme.building) assert.match(theme.buildingShadow ?? "", /^#[0-9a-f]{6}$/, name);
  }
});

test("a building's outline is Mapy's darker tan", () => {
  assert.equal(byId("building-pkg").paint["fill-outline-color"], "#c2b79b");
});

// 508 Mapy draws industrial buildings grey on a lighter industrial ground
test("industrial buildings are grey", () => {
  assert.equal(byId("building-pkg__var5").paint["fill-color"], "#d4d1cc");
  assert.match(JSON.stringify(byId("building-pkg__var5").filter), /"warehouse"/);
});

// 508 the types are told apart by night too, in their own dark colours
test("building types keep their own colours in the dark theme", () => {
  const dark = buildStyle({
    theme: "tmava", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", buildingsUrl: "https://x/buildings.pmtiles", overrides
  });
  const get = (id) => dark.layers.find((l) => l.id === id);
  assert.equal(get("building-pkg__var1").paint["fill-color"], "#4a4752");
  assert.equal(get("building-pkg__var3").paint["fill-color"], "#3c3b4c");
  assert.equal(get("building-pkg__var1__outline").paint["line-color"], "#5c5a66");
  assert.notEqual(get("building-pkg__var1").paint["fill-color"], get("building-pkg").paint["fill-color"]);
});

// 508 the town stays tinted close up, in Mapy's cream
test("the residential area keeps its cream tint close up", () => {
  const residential = byId("landuse-residential");
  assert.equal(residential.paint["fill-opacity"], undefined);
  assert.equal(residential.paint["fill-color"].at(-1), "#efe6d4");
});
