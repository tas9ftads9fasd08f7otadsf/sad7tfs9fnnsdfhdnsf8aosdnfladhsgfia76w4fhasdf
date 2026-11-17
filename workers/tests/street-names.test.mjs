import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const name = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
}).layers.find((l) => l.id === "road-name").paint["text-color"];

// 537 Mapy's street names are black, ours were brown: the darkest text pixels were #605142 against #000000
test("by day a street name is black, at night it stays light", () => {
  assert.equal(name("svetla"), "#000000");
  const light = parseInt(String(name("tmava")).slice(1, 3), 16);
  assert.ok(light > 0x80, "the night theme keeps its light grey names");
});
