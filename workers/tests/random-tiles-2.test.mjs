import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeOverrides, valueAtZoom } from "../../poc/web/themes.js";

const { overrides, problems } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const L = overrides.maps.turisticka.layers;

// 457 forest tracks read as bold dashes at Mapy's z14-z15, as on Mapy
test("forest tracks are bold from z13", () => {
  assert.deepEqual(problems, []);
  const width = L["road-track"].paint["line-width"];
  assert.ok(valueAtZoom(width, 13) >= 1.2);
  assert.ok(valueAtZoom(width, 14) >= 1.6);
});
