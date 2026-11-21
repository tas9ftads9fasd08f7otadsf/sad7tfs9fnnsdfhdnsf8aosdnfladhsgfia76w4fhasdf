import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const layersOf = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  buildingsUrl: "https://x/buildings.pmtiles",
  overrides: normalizeOverrides(saved).overrides
}).layers;
const day = layersOf("svetla");
const colour = (layers, id, z, prop = "fill-color") => {
  const expr = layers.find((l) => l.id === id).paint[prop];
  if (!Array.isArray(expr)) return expr;
  let out = expr[2];
  for (let i = 3; i < expr.length; i += 2) if (expr[i] <= z) out = expr[i + 1];
  return out;
};

// 560 each colour brings our pixels to Mapy's on 59 tiles, at the zooms it is set for
const WANT = {
  "landcover-scrub": { 12: "#c9e0ad", 13: "#cde4b1", 14: "#cde4b1" },
  "landcover-wood": { 12: "#c3dea4", 13: "#c8e4a9", 14: "#d0ebb1", 15: "#ceebaf" },
  "landcover-golf": { 13: "#d6e9bb", 16: "#d6e9bb" },
  "landuse-industrial": { 13: "#dad4c5", 14: "#dddad4", 15: "#e5e1d9", 16: "#e5e1d9" },
  "building-pkg": { 13: "#e2d3b9", 14: "#e7dabc", 15: "#e2d3b9" },
  water: { 12: "#98bddb", 13: "#98bddb", 14: "#9ec5e2", 16: "#9ec5e2" },
  "building-pkg-shadow": { 15: "#5d647f" }
};
test("by day each area has the colour that brings it to Mapy's", () => {
  for (const [id, byZoom] of Object.entries(WANT)) {
    for (const [z, hex] of Object.entries(byZoom)) assert.equal(colour(day, id, Number(z)), hex, `${id} z${z}`);
  }
});

// 560 industrial land was a cool grey (#d8d5ce) beside Mapy's warm #e5e1d9 from z15
test("industrial land is warmer and lighter from z15 than before", () => {
  const [r, , b] = [1, 3, 5].map((i) => parseInt(colour(day, "landuse-industrial", 15).slice(i, i + 2), 16));
  assert.ok(r - b >= 10, "warm");
  assert.ok(r > 0xd8);
});

test("the night colours are untouched", () => {
  const night = layersOf("tmava");
  assert.equal(colour(night, "landcover-scrub", 12), "#272a1e");
  assert.equal(colour(night, "landuse-industrial", 15), "#2b2822");
  assert.equal(colour(night, "landcover-wood", 14), "#17251a");
});
