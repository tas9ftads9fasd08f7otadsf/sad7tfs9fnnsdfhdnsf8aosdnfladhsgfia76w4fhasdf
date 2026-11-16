import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);

const widthAt = (expr, z) => {
  const base = expr[1][1];
  const st = expr.slice(3);
  for (let i = 0; i < st.length - 2; i += 2) {
    const [z0, v0, z1, v1] = st.slice(i, i + 4);
    if (z <= z1) return v0 + ((base ** (z - z0) - 1) / (base ** (z1 - z0) - 1)) * (v1 - v0);
  }
  return st[st.length - 1];
};
const dashAt = (expr, z) => {
  let out = expr[2][1];
  for (let i = 3; i < expr.length; i += 2) if (expr[i] <= z) out = expr[i + 1][1];
  return out;
};

// Mapy's dash and gap in CSS px at our style zoom, measured along OSM ways
const MAPY = {
  "road-track": { 13: [6.25, 2], 14: [6, 2.25], 15: [10, 4.5], 16: [11.75, 8.5] },
  "road-path": { 13: [3.25, 1.75], 14: [3.25, 2], 15: [5.25, 4.25], 16: [11, 6.5] }
};

// 512 track and path dashes were a single pattern, too short on paths and too gappy on tracks
test("track and path dashes are Mapy's length and gap at z13–z16", () => {
  for (const [id, zooms] of Object.entries(MAPY)) {
    const paint = byId(id).paint;
    for (const [z, [dash, gap]] of Object.entries(zooms)) {
      const w = widthAt(paint["line-width"], Number(z));
      const [d, g] = dashAt(paint["line-dasharray"], Number(z));
      assert.ok(Math.abs(d * w - dash) / dash <= 0.15, `${id} z${z}: dash ${(d * w).toFixed(2)} vs ${dash}`);
      assert.ok(Math.abs(g * w - gap) / gap <= 0.15, `${id} z${z}: gap ${(g * w).toFixed(2)} vs ${gap}`);
    }
  }
});
