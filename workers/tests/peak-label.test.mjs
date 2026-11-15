import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, THEMES } from "../../poc/web/themes.js";

const build = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: {}
});
const peak = (theme) => build(theme).layers.find((l) => l.id === "mountain-peak");

// 508 Mapy.com sets a peak as the name, a small triangle, then the height
test("a peak is its name, the icon in the middle line and the bare height", () => {
  const { layout } = peak("svetla");
  const [op, name, nameStyle, gap, gapStyle, height, heightStyle] = layout["text-field"];
  assert.equal(op, "format");
  assert.deepEqual(nameStyle["text-font"], ["literal", layout["text-font"]]);
  assert.equal(gap.split("\n").length, 3, "an empty line between name and height");
  assert.deepEqual(gapStyle, {});
  assert.ok(name && JSON.stringify(height).includes("ele"));
  assert.ok(!JSON.stringify(height).includes(" m"), "no unit after the height");
  assert.deepEqual(heightStyle["text-font"], ["literal", ["Noto Sans Bold"]]);
  assert.equal(layout["text-anchor"], "center");
  assert.equal(layout["text-offset"], undefined);
  assert.ok(layout["icon-size"] <= 0.6, "a small triangle");
});

test("peak names are italic", () => {
  assert.deepEqual(peak("svetla").layout["text-font"], ["Noto Sans Italic"]);
});

// 508 the light themes' peak names are dark brown, not mid grey-brown
test("peak text is dark on the light themes", () => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  };
  for (const theme of ["svetla", "outdoor", "retro"]) {
    assert.ok(lum(THEMES[theme].peakText) < 70, `${theme} ${THEMES[theme].peakText}`);
  }
});
