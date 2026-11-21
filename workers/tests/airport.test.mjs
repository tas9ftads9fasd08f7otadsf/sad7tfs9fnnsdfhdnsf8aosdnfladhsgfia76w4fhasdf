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
  overrides: normalizeOverrides(saved).overrides
}).layers;
const day = layersOf("svetla");
const byId = (layers, id) => layers.find((l) => l.id === id);
const colourAt = (expr, z) => {
  if (!Array.isArray(expr)) return expr;
  let out = expr[2];
  for (let i = 3; i < expr.length; i += 2) if (expr[i] <= z) out = expr[i + 1];
  return out;
};
const width = (id, z, layers = day) => {
  const e = byId(layers, id).paint["line-width"];
  for (let i = 3; i < e.length; i += 2) if (e[i] === z) return e[i + 1];
  throw new Error(`${id} has no stop at z${z}`);
};

// 559 the airport was lavender with no runway to see; Mapy's apron is grey-beige, the runway white
test("by day an apron is grey-beige, warmer and lighter as you zoom in, never lavender", () => {
  const fill = byId(day, "aeroway-area").paint["fill-color"];
  const want = { 13: "#d5d3cd", 14: "#dcdad4", 15: "#e6e2da", 17: "#e6e2da" };
  for (const [z, hex] of Object.entries(want)) assert.equal(colourAt(fill, Number(z)), hex, `z${z}`);
  for (let z = 0; z <= 20; z++) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colourAt(fill, z).slice(i, i + 2), 16));
    assert.ok(!(b > g && r > g), `z${z} is lavender`);
  }
});

test("a runway and a taxiway are white with a tan border, as wide as on Mapy", () => {
  for (const id of ["aeroway-runway", "aeroway-taxiway"]) {
    assert.equal(byId(day, id).paint["line-color"], "#ffffff", id);
    const casing = byId(day, `${id}-casing`);
    assert.ok(casing, `${id} has a border`);
    assert.ok(day.indexOf(casing) < day.indexOf(byId(day, id)), `${id} border under it`);
    for (const z of [13, 14, 15, 16]) {
      assert.ok(Math.abs((width(`${id}-casing`, z) - width(id, z)) / 2 - 1.25) < 0.01, `${id} z${z} border`);
    }
  }
  assert.equal(width("aeroway-runway", 13), 11.75);
  assert.equal(width("aeroway-runway", 15), 18);
  assert.equal(width("aeroway-taxiway", 14), 1.75);
  assert.equal(width("aeroway-taxiway", 15), 5.75);
  assert.equal(width("aeroway-taxiway", 16), 8.25);
});

test("at night the runway still stands out from the apron", () => {
  const night = layersOf("tmava");
  const light = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b);
  assert.ok(light(byId(night, "aeroway-runway").paint["line-color"]) > light(colourAt(byId(night, "aeroway-area").paint["fill-color"], 16)));
});
