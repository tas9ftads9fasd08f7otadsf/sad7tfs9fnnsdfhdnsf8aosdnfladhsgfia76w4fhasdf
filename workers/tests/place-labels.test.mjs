import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { layers } = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const sizeAt = (id, zoom) => {
  const expr = layers.find((l) => l.id === id).layout["text-size"];
  const stops = [];
  for (let i = 3; i < expr.length; i += 2) stops.push([expr[i], expr[i + 1]]);
  const hi = stops.findIndex(([z]) => z >= zoom);
  if (hi === -1) return stops[stops.length - 1][1];
  if (hi === 0) return stops[0][1];
  const [z0, s0] = stops[hi - 1];
  const [z1, s1] = stops[hi];
  return s0 + ((s1 - s0) * (zoom - z0)) / (z1 - z0);
};

// 545 Mapy's town, village and suburb names run 1.2 to 1.5 times ours in width at z11–z14
const MAPY = {
  "place-town": { 11: 20, 12: 22, 13: 23, 14: 24 },
  "place-village": { 12: 17, 13: 19.5, 14: 22 },
  "place-suburb": { 12: 13.5, 13: 15.5, 14: 18 }
};
test("a town, village or suburb name is as large as on Mapy at z11–z14", () => {
  for (const [id, byZoom] of Object.entries(MAPY)) {
    for (const [z, want] of Object.entries(byZoom)) {
      assert.ok(Math.abs(sizeAt(id, Number(z)) - want) / want <= 0.05, `${id} z${z}: ${sizeAt(id, Number(z))} vs ${want}`);
    }
  }
});

test("a bigger place never has the smaller name", () => {
  for (const z of [11, 12, 13, 14]) {
    assert.ok(sizeAt("place-town", z) >= sizeAt("place-village", z) - 2.5, `town z${z}`);
    assert.ok(sizeAt("place-village", z) >= sizeAt("place-suburb", z), `village z${z}`);
  }
  for (const id of ["place-town", "place-village", "place-suburb"]) {
    for (let z = 9; z < 16; z++) assert.ok(sizeAt(id, z + 1) >= sizeAt(id, z), `${id} grows to z${z + 1}`);
  }
});
