import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  rocksUrl: "https://x/rocks.pmtiles",
  contoursUrl: "https://x/contours.pmtiles",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

// a paint value at a zoom: a constant, a zoom step or a linear interpolation of numbers
const at = (value, z) => {
  if (!Array.isArray(value)) return value;
  if (value[0] === "step") {
    let out = value[2];
    for (let i = 3; i < value.length; i += 2) if (value[i] <= z) out = value[i + 1];
    return out;
  }
  if (value[0] === "interpolate") {
    const st = value.slice(3);
    if (z <= st[0]) return st[1];
    for (let i = 0; i < st.length - 2; i += 2) {
      if (z <= st[i + 2]) return st[i + 1] + ((z - st[i]) / (st[i + 2] - st[i])) * (st[i + 3] - st[i + 1]);
    }
    return st[st.length - 1];
  }
  return value;
};
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

// 516 Mapy's rock walls are dark on pale scree; ours were one grey-brown, rock and scree alike
test("rock walls are far darker than scree from z12", () => {
  for (const z of [12, 13, 14, 15, 16]) {
    const rock = lightness(at(byId("rock-area").paint["fill-color"], z));
    const scree = lightness(at(byId("landcover-rock").paint["fill-color"], z));
    assert.ok(scree - rock >= 35, `z${z}: scree L${scree.toFixed(0)} vs rock L${rock.toFixed(0)}`);
  }
  assert.equal(byId("landcover-rock").paint["fill-opacity"], 1);
});

// 516 dense contours striped the rock light; dark and faint, they vanish on rock as on Mapy
// (at z12 they stay full, #455: Mapy's z13 draws them so on meadows)
test("contours are dark and faint from z13, so rock walls stay solid", () => {
  for (const id of ["contour-minor", "contour-major"]) {
    for (const z of [13, 14, 16]) {
      const paint = byId(id).paint;
      assert.ok(lightness(at(paint["line-color"], z)) <= 40, `${id} z${z} colour`);
      assert.ok(at(paint["line-opacity"], z) <= 0.5, `${id} z${z} opacity`);
    }
  }
});

// 516 Mapy shows no pebbles on scree at its z13; ours filled the overview with dots
test("the scree pattern fades in at z13", () => {
  const pattern = byId("landcover-rock__pattern");
  assert.equal(at(pattern.paint["fill-opacity"], 12), 0);
  assert.ok(at(pattern.paint["fill-opacity"], 13) > 0.3);
});
