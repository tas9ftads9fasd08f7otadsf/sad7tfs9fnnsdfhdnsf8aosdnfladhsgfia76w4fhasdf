import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeOverrides, valueAtZoom } from "../../poc/web/themes.js";

const { overrides, problems } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const L = overrides.maps.turisticka.layers;

// 457 forest tracks read as dashes from z13; 549 measured again, Mapy's are thinner than first read
test("forest tracks are drawn from z13, as thin as Mapy's", () => {
  assert.deepEqual(problems, []);
  const width = L["road-track"].paint["line-width"];
  assert.ok(valueAtZoom(width, 13) >= 0.8);
  assert.ok(valueAtZoom(width, 14) >= 1.2);
  assert.ok(valueAtZoom(width, 16) <= 1.8, "Mapy's tracks are about 1.5 px at z16");
});
