import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, TRAIL_OFFSET_ROAD, TRAIL_STRIPE } from "../../poc/web/themes.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles"
});

// MapLibre's `exponential` interpolation between the two stops around `z`
const at = (stops, z, base = 1.5) => {
  const i = stops.findIndex(([sz]) => sz >= z);
  if (stops[i][0] === z) return stops[i][1];
  const [[z0, v0], [z1, v1]] = [stops[i - 1], stops[i]];
  const t = (base ** (z - z0) - 1) / (base ** (z1 - z0) - 1);
  return v0 + t * (v1 - v0);
};

const casing = () => {
  const width = style.layers.find((l) => l.id === "road-minor-casing").paint["line-width"];
  const stops = [];
  for (let i = 3; i < width.length; i += 2) {
    const v = width[i + 1];
    stops.push([width[i], Array.isArray(v) ? v[1] : v]);
  }
  return stops;
};

// 502 TestFlight ADJm: at z18+ a trail on a road floated metres beside it
test("a road's trail stripe runs along a minor road's edge from z16 to z20", () => {
  const road = casing();
  for (const z of [16, 17, 18, 18.5, 19, 20]) {
    const inner = at(TRAIL_OFFSET_ROAD, z) - at(TRAIL_STRIPE, z) / 2;
    const edge = at(road, z) / 2;
    assert.ok(Math.abs(inner - edge) <= 1, `z${z}: stripe starts at ${inner.toFixed(1)} px, road edge ${edge.toFixed(1)} px`);
  }
});
