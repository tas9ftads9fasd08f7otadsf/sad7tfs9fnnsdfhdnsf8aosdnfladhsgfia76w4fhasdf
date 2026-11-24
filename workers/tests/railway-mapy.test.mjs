import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { valueAtZoom } from "../../poc/web/layer-style.js";
import { DASH_PRESETS } from "../../poc/web/patterns.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(JSON.parse(readFileSync(
    new URL("../../poc/web/style-overrides.json", import.meta.url)))).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 575 Mapy draws a railway as a ~4 px grey band at its z12 with white dashes in the middle;
// ours was a thin dark line with short ticks
test("a railway is a grey band with white dashes down its middle, as wide as Mapy's", () => {
  const band = byId("rail-bg").paint;
  const dash = byId("rail-hatch").paint;
  assert.equal(band["line-color"], "#717170");
  const w = (p, z) => valueAtZoom(p["line-width"], z);
  assert.ok(w(band, 11) >= 3.5, `Mapy's z12 band ${w(band, 11)}`);
  assert.ok(w(band, 13) < w(band, 11), "thinner per track at Mapy's z14");
  assert.ok(w(band, 15) >= 3.5, "wide again close up");
  for (const z of [11, 13, 15]) assert.ok(w(dash, z) < w(band, z) * 0.6, `the dash sits inside at z${z}`);
  assert.deepEqual(dash["line-dasharray"], DASH_PRESETS.find((p) => p.id === "rail-centre").dash);
  assert.deepEqual(dash["line-dasharray"], [4, 4], "dashes as long as their gaps");
});
