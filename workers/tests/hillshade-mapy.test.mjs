import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { valueAtZoom } from "../../poc/web/layer-style.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  demTiles: "https://x/terrain.pmtiles",
  overrides: normalizeOverrides(JSON.parse(readFileSync(
    new URL("../../poc/web/style-overrides.json", import.meta.url)))).overrides
});
const paint = style.layers.find((l) => l.id === "hillshade").paint;
const alpha = (hex) => parseInt(hex.slice(7, 9), 16) / 255;

// 571 the owner: Mapy's shaded slopes are darker; ours were 12 levels lighter at its z13
test("shaded slopes are as dark as Mapy's far out and lighten close up", () => {
  assert.ok(alpha(paint["hillshade-shadow-color"]) >= 0.75, paint["hillshade-shadow-color"]);
  const at = (z) => valueAtZoom(paint["hillshade-exaggeration"], z);
  assert.ok(at(12) >= 0.85, `z12 ${at(12)}`);
  assert.ok(at(13) >= 0.75, `z13 ${at(13)}`);
  assert.ok(at(16) < at(13), "lighter close up, as on Mapy");
});
