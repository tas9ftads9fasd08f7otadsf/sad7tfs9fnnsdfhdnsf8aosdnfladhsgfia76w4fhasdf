import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, BUILDING_SHADOW, THEMES } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const build = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  buildingsUrl: "https://x/buildings.pmtiles",
  overrides: normalizeOverrides(saved).overrides
});
const day = build("svetla");
const index = (style, id) => style.layers.findIndex((l) => l.id === id);

// 535 Mapy's houses cast a shadow to the south-east; ours were flat
test("a house casts a shadow south-east, under itself, by day", () => {
  for (const id of ["building", "building-pkg"]) {
    const shadow = day.layers[index(day, `${id}-shadow`)];
    assert.ok(shadow, id);
    assert.equal(index(day, `${id}-shadow`) + 1, index(day, id), `${id}: the shadow lies right under it`);
    assert.deepEqual(shadow.paint["fill-translate"], BUILDING_SHADOW.translate);
    assert.ok(shadow.paint["fill-translate"][0] > 0 && shadow.paint["fill-translate"][1] > 0, "south-east");
    assert.equal(shadow.paint["fill-translate-anchor"], "map");
    assert.ok(shadow.minzoom >= BUILDING_SHADOW.minzoom);
    assert.equal(shadow.metadata["frico:derived"], id);
  }
});

// 535 the night reference has flat houses
test("at night houses stay flat", () => {
  assert.equal(build("tmava").layers.some((l) => /^building.*-shadow$/.test(l.id)), false);
});

// 535 every theme has the ink, so the editor can recolour it
test("every theme has a building shadow ink", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const palette = theme.colors || theme.palette || theme;
    assert.match(String(palette.buildingShadow), /^#[0-9a-f]{6}$/i, name);
  }
});
