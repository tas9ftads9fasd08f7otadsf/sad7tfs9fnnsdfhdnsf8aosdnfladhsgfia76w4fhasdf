import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, STREAM_MINZOOM, RIVER_WIDTH } from "../../poc/web/themes.js";

const { overrides } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const styleOf = (waterUrl) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  waterUrl,
  overrides
});
const byId = (style, id) => style.layers.find((l) => l.id === id);

// 454 OpenMapTiles has streams only close up; Mapy shows them from its z12
test("rivers and streams come from the water package when there is one", () => {
  const withPkg = styleOf("https://x/water.pmtiles");
  for (const id of ["waterway-river", "waterway-minor"]) {
    assert.equal(byId(withPkg, id).source, "water", id);
    assert.equal(byId(styleOf(null), id).source, "omt", id);
  }
  assert.ok(byId(withPkg, "waterway-minor").minzoom <= STREAM_MINZOOM && STREAM_MINZOOM <= 11);
});

// 454 Mapy's water lines are a deeper blue than its lakes, rivers bold from afar
test("water lines are darker than lakes and rivers bold from afar", () => {
  const style = styleOf("https://x/water.pmtiles");
  assert.notEqual(byId(style, "waterway-river").paint["line-color"], byId(style, "water").paint["fill-color"]);
  assert.ok(Object.fromEntries(RIVER_WIDTH)[11] >= 2);
});
