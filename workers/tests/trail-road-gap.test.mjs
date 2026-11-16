import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAIL_OFFSET_ROAD, TRAIL_OFFSET_PATH } from "../../poc/web/themes.js";

// the style interpolates offsets `exponential 1.5`, as it does the stripe width
const at = (stops, z, base = 1.5) => {
  const i = stops.findIndex(([sz]) => sz >= z);
  if (stops[i][0] === z) return stops[i][1];
  const [[z0, v0], [z1, v1]] = [stops[i - 1], stops[i]];
  return v0 + ((base ** (z - z0) - 1) / (base ** (z1 - z0) - 1)) * (v1 - v0);
};

// Mapy's stripe centre off a single route's way in CSS px at our style zoom
const MAPY = {
  road: [TRAIL_OFFSET_ROAD, { 13: 4.2, 14: 4.2, 15: 4.5 }],
  path: [TRAIL_OFFSET_PATH, { 13: 3.45, 14: 3.5, 15: 3.5 }]
};

// 511 stripes hugged the road and path, Mapy leaves a gap: twice as far out at z13–z14
test("stripes lie as far off roads and paths as on Mapy at z13–z15", () => {
  for (const [kind, [stops, zooms]] of Object.entries(MAPY)) {
    for (const [z, want] of Object.entries(zooms)) {
      const got = at(stops, Number(z));
      assert.ok(Math.abs(got - want) / want <= 0.2, `${kind} z${z}: ${got.toFixed(2)} vs ${want}`);
    }
  }
});
