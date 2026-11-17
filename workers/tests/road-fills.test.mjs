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
const widthAt = (id, z) => {
  const e = layers.find((l) => l.id === id).paint["line-width"];
  for (let i = 3; i < e.length; i += 2) if (e[i] === z) return e[i + 1][1];
  throw new Error(`${id} has no stop at z${z}`);
};

// white fill across a road in CSS px on Mapy's tiles, keyed by our zoom (its tile zoom minus one)
const MAPY = {
  tertiary: { 13: 3.5, 14: 4.75, 15: 7.5, 16: 12.5 },
  minor: { 14: 1.6, 15: 3.9, 16: 8 },
  service: { 14: 1, 15: 2.5, 16: 5.25 }
};

// 542 our minor and service fills ran up to twice Mapy's at z14–z15 and tertiary ran a fifth under
test("a tertiary, minor and service road is as wide as on Mapy at z14–z16", () => {
  for (const [id, byZoom] of Object.entries(MAPY)) {
    for (const [z, want] of Object.entries(byZoom)) {
      const got = widthAt(`road-${id}`, Number(z));
      assert.ok(Math.abs(got - want) / want <= 0.1, `${id} z${z}: ${got} vs ${want}`);
    }
  }
});

test("a wider road never draws narrower than a smaller one", () => {
  for (const z of [13, 14, 15, 16]) {
    const w = ["service", "minor", "tertiary"].map((id) => widthAt(`road-${id}`, z));
    assert.deepEqual([...w].sort((a, b) => a - b), w, `z${z}`);
  }
});
