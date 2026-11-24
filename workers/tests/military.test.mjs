import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, normalizeOverrides, THEMES, MILITARY_WASH, MILITARY_BAND, MILITARY_BAND_OPACITY
} from "../../poc/web/themes.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(JSON.parse(readFileSync(
    new URL("../../poc/web/style-overrides.json", import.meta.url)))).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const stops = (expr) => expr.slice(3).filter((_, i) => i % 2 === 1);

// 567 bug: a tan fill hid the forest and meadows of the Záhorie military district; Mapy shows them
test("a military area keeps its land: a light grey wash far out, nothing from Mapy's z14", () => {
  const wash = byId("landuse-military");
  assert.equal(wash.paint["fill-color"], THEMES.svetla.military);
  assert.equal(THEMES.svetla.military, "#d8d8d4", "grey, not tan");
  assert.ok(Math.max(...stops(wash.paint["fill-opacity"])) <= 0.5, "the forest shows through");
  assert.equal(MILITARY_WASH.at(-1)[1], 0);
  assert.ok(wash.maxzoom <= 13, "Mapy's z14 shows the land plain");
});

// 567 Mapy marks the area by a grey band inside its border, 7 to 30 px on its 2× tiles
test("a military area has a translucent grey band inside its border", () => {
  const band = byId("military-band");
  assert.equal(band["source-layer"], "military_border");
  assert.deepEqual(stops(band.paint["line-offset"]), MILITARY_BAND.map(([, w]) => w / 2), "inward");
  assert.ok(Math.max(...MILITARY_BAND.map(([, w]) => w)) >= 14, "Mapy's 30 px at 2× close up");
  assert.ok(MILITARY_BAND_OPACITY < 0.6, "the land shows through it");
  assert.equal(band.paint["line-color"], THEMES.svetla.militaryBorder);
  assert.ok(style.layers.indexOf(byId("landuse-military")) < style.layers.indexOf(band));
});
