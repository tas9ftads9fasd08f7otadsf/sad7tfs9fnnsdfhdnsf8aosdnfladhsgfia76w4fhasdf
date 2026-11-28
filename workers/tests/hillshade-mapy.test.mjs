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

// 588 the owner: Mapy's shadows stay dark close up; variant C of the comparison in 586
test("shaded slopes are as dark as Mapy's and stay dark close up", () => {
  assert.ok(alpha(paint["hillshade-shadow-color"]) >= 0.85, paint["hillshade-shadow-color"]);
  const at = (z) => valueAtZoom(paint["hillshade-exaggeration"], z);
  for (const z of [12, 13, 14, 15, 16]) assert.ok(at(z) >= 0.85, `z${z} ${at(z)}`);
});
