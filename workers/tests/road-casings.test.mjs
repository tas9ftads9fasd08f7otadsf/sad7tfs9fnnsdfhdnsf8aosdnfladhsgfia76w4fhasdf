import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, ROAD_DEFS, ROAD_CASING_FROM_Z } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

// a road width's stops, each `["*", width, ramp factor]`
const stops = (expr) => {
  const out = {};
  for (let i = 3; i < expr.length; i += 2) out[expr[i]] = expr[i + 1][1];
  return out;
};
const colourAt = (value, z) => {
  if (!Array.isArray(value)) return value;
  let out = value[2];
  for (let i = 3; i < value.length; i += 2) if (value[i] <= z) out = value[i + 1];
  return out;
};
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  return 116 * Math.cbrt(0.2126 * r + 0.7152 * g + 0.0722 * b) - 16;
};

// Mapy's border per side in CSS px, along OSM roads on its z14–z16 tiles
const MAPY = { primary: 1.6, secondary: 1.6, tertiary: 1.7, minor: 1.25, service: 1.3 };

// 519 our borders were 0.6–1.2 px a side and vanished in towns; Mapy's are 1.25–1.7
test("road borders are Mapy's width from z13 up", () => {
  for (const [id, want] of Object.entries(MAPY)) {
    const fill = stops(byId(`road-${id}`).paint["line-width"]);
    const casing = stops(byId(`road-${id}-casing`).paint["line-width"]);
    for (const z of Object.keys(fill).map(Number).filter((z) => z >= ROAD_CASING_FROM_Z && z <= 16)) {
      const edge = (casing[z] - fill[z]) / 2;
      assert.ok(Math.abs(edge - want) / want <= 0.2, `${id} z${z}: ${edge.toFixed(2)} vs ${want}`);
    }
  }
});

// 519 below z13 the casing is paper-coloured; wider, it would rub out what lies beside the road
test("below z13 the border keeps its former width", () => {
  for (const [id, , , , , widths, extra] of ROAD_DEFS) {
    if (!MAPY[id]) continue;
    const casing = stops(byId(`road-${id}-casing`).paint["line-width"]);
    for (const [z, w] of widths.filter(([z]) => z < ROAD_CASING_FROM_Z)) {
      assert.ok(Math.abs(casing[z] - (w + extra)) < 1e-9, `${id} z${z}`);
    }
  }
});

// 519 in a town the beige border melted into the built-up area's tan
test("a white road's border stands out from the built-up area at z13–z16", () => {
  const town = lightness(colourAt(byId("landuse-residential").paint["fill-color"], 13));
  for (const id of ["tertiary", "minor", "service"]) {
    for (const z of [14, 15, 16]) {
      const border = lightness(colourAt(byId(`road-${id}-casing`).paint["line-color"], z));
      assert.ok(town - border >= 8, `${id} z${z}: border L${border.toFixed(0)} vs town L${town.toFixed(0)}`);
    }
  }
});
