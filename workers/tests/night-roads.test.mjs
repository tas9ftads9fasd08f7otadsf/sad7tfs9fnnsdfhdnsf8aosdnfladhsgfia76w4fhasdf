import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const build = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const colourAt = (value, z) => {
  if (!Array.isArray(value)) return value;
  let out = value[2];
  for (let i = 3; i < value.length; i += 2) if (value[i] <= z) out = value[i + 1];
  return out;
};
const night = build("tmava");
const day = build("svetla");
const paint = (style, id, z) => colourAt(style.layers.find((l) => l.id === id).paint["line-color"], z);

// 527 at night local roads were a purple grey on a near-black edge; navigation draws them black, edged grey
test("at night tertiary, local and service roads are black with a light grey edge", () => {
  for (const id of ["tertiary", "minor", "service"]) {
    for (const z of [13, 15, 17]) {
      assert.equal(paint(night, `road-${id}`, z), "#000000", `${id} z${z}`);
      assert.equal(paint(night, `road-${id}-casing`, z), "#646361", `${id} casing z${z}`);
    }
  }
  const ground = night.layers.find((l) => l.type === "background").paint["background-color"];
  assert.notEqual(ground, "#000000", "the road stays darker than the ground");
});

// 527 the day keeps its white roads
test("by day local roads stay white", () => {
  for (const id of ["tertiary", "minor", "service"]) assert.equal(paint(day, `road-${id}`, 16), "#ffffff", id);
});
