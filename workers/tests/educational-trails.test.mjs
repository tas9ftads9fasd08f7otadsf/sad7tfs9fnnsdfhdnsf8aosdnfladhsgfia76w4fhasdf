import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, normalizeOverrides, TRAIL_EDUCATIONAL_DASH, TRAIL_STRIPE_WALK
} from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const has = (expr, text) => JSON.stringify(expr).includes(text);

const widthAt = (stops, z) => {
  const i = stops.findIndex(([sz]) => sz >= z);
  if (stops[i][0] === z) return stops[i][1];
  const [[z0, v0], [z1, v1]] = [stops[i - 1], stops[i]];
  return v0 + ((1.5 ** (z - z0) - 1) / (1.5 ** (z1 - z0) - 1)) * (v1 - v0);
};
const dashAt = (z) => TRAIL_EDUCATIONAL_DASH.filter(([from]) => from <= z).pop()[1];

// 515 an educational trail was a plain green stripe, on top of the green mark's
test("educational trails have a dash-dot layer of their own, hiking leaves them out", () => {
  const edu = byId("trail-hiking-educational");
  const hiking = byId("trail-hiking");
  assert.ok(has(edu.filter, '"edu"') && has(hiking.filter, '"edu"'));
  assert.ok(has(hiking.filter, '["!",'), "hiking leaves educational trails out");
  assert.equal(edu.metadata["frico:derived"], "trail-hiking");
  assert.equal(edu.metadata["frico:twin"], "trail-hiking");
  assert.deepEqual(edu.paint["line-color"], hiking.paint["line-color"]);
  assert.equal(dashAt(14).length, 4, "dash, gap, dot, gap");
});

// 515 Mapy: 10 px dash, 4 px gap, 2 px dot, 4 px gap, measured on its z15 and z16 tiles
test("the dash-dot is Mapy's length in screen pixels at z14–z16", () => {
  const mapy = [10, 4, 2, 4];
  for (const z of [14, 15, 16]) {
    const w = widthAt(TRAIL_STRIPE_WALK, z);
    dashAt(z).forEach((d, i) => {
      assert.ok(Math.abs(d * w - mapy[i]) / mapy[i] <= 0.15, `z${z} part ${i}: ${(d * w).toFixed(2)} vs ${mapy[i]}`);
    });
  }
});

// 515 Mapy sets it one lane out, 5–5.5 px from a path where it is the only route
test("an educational trail lies one lane further out", () => {
  const offset = JSON.stringify(byId("trail-hiking-educational").paint["line-offset"]);
  assert.match(offset, /\["\*",\["\+",.*?\["coalesce",\["get","edu"\],0\]\]/);
});

// 518 bug: an override of the hiking routes reached the plain stripes, not the educational ones
test("an educational trail takes the hiking routes' override, but keeps its dash-dot", () => {
  const own = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    trailsUrl: "https://x/trails.pmtiles",
    overrides: normalizeOverrides({
      layers: { "trail-hiking": { paint: { "line-opacity": 0.4 }, dash: "dotted" } }
    }).overrides
  });
  const edu = own.layers.find((l) => l.id === "trail-hiking-educational");
  assert.equal(edu.paint["line-opacity"], 0.4);
  assert.equal(edu.paint["line-dasharray"][0], "step");
});
