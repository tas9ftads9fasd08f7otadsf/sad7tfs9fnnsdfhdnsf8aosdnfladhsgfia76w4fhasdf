import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

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

// 548 Mapy draws a church grey and a public building pale grey, not like a house
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

test("a building's outline is Mapy's darker tan", () => {
  assert.equal(byId("building-pkg").paint["fill-outline-color"], "#c2b79b");
});
