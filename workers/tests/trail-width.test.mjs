import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, TRAIL_STRIPE, TRAIL_TYPE_IDS } from "../../poc/web/themes.js";
import { dashValue } from "../../poc/web/patterns.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides } = normalizeOverrides(saved);
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const stops = (expr) => expr.slice(3).filter((_, i) => i % 2 === 1);

// 443 a narrower stroke than the pitch leaves gaps between trails on one path
test("every trail is drawn as wide as the pitch between trails", () => {
  for (const id of TRAIL_TYPE_IDS) {
    assert.deepEqual(stops(byId(`trail-${id}`).paint["line-width"]), TRAIL_STRIPE.map(([, w]) => w), id);
  }
});

// 443 Mapy draws trails about 2 px wide already at its z12
test("trails are bold from the overview on", () => {
  const at = Object.fromEntries(TRAIL_STRIPE);
  assert.ok(at[11] >= 2, `${at[11]} px at z11`);
});

// 443 Mapy dashes every cycle route, long-distance ones too
test("cycle routes are short dashes at every zoom", () => {
  const bike = byId("trail-bicycle");
  assert.deepEqual(bike.paint["line-dasharray"], dashValue("dashed-fine"));
  assert.equal(style.layers.some((l) => l.id.startsWith("trail-bicycle__var")), false);
});
