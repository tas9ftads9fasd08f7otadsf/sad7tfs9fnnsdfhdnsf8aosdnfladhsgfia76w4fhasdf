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
const sizeAt = (expr, zoom) => {
  const stops = [];
  for (let i = 3; i < expr.length; i += 2) stops.push([expr[i], expr[i + 1]]);
  const hi = stops.findIndex(([z]) => z >= zoom);
  if (hi <= 0) return stops[Math.max(hi, 0)][1];
  const [z0, s0] = stops[hi - 1];
  const [z1, s1] = stops[hi];
  return s0 + ((s1 - s0) * (zoom - z0)) / (z1 - z0);
};

// 541 Mapy draws a city at 14px to z9 and at 27px from z10 on; ours crept from 12px to 22px
test("a city name is small to zoom 9 and large from zoom 10 on", () => {
  const size = layers.find((l) => l.id === "place-city").layout["text-size"];
  assert.ok(sizeAt(size, 9) <= 14.5, "small at z9");
  for (const z of [10, 11, 12, 13]) assert.ok(Math.abs(sizeAt(size, z) - 27) < 1, `z${z}`);
  assert.ok(sizeAt(size, 5) < sizeAt(size, 9), "grows towards z9");
});

test("a city name stays bold capitals", () => {
  const { layout } = layers.find((l) => l.id === "place-city");
  assert.equal(layout["text-transform"], "uppercase");
  assert.match(JSON.stringify(layout["text-font"]), /[Bb]old/);
});
