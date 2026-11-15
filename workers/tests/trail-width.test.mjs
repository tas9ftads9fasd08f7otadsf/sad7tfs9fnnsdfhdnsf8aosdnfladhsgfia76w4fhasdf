import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, normalizeOverrides, TRAIL_STRIPE, TRAIL_STRIPE_WALK, TRAIL_TYPES, TRAIL_TYPE_IDS
} from "../../poc/web/themes.js";
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
    // 508 walking routes are wider than cycle ones, each side keeps its own pitch
    const curve = TRAIL_TYPES.find((t) => t.id === id).side === 1 ? TRAIL_STRIPE_WALK : TRAIL_STRIPE;
    assert.deepEqual(stops(byId(`trail-${id}`).paint["line-width"]), curve.map(([, w]) => w), id);
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

// 508 at z11 the map showed every local route; only long-distance and regional ones belong there
test("local routes start at z12 and regional ones at z11", () => {
  const at = (expr, zoom, tier) => {
    const stopsAt = expr.slice(3);
    let out;
    for (let i = 0; i < stopsAt.length; i += 2) if (stopsAt[i] <= zoom) out = stopsAt[i + 1];
    const cases = out.slice(1, -1);
    for (let i = 0; i < cases.length; i += 2) if (cases[i][2] === tier) return cases[i + 1];
    return out[out.length - 1];
  };
  for (const id of TRAIL_TYPE_IDS) {
    const opacity = byId(`trail-${id}`).paint["line-opacity"];
    assert.equal(at(opacity, 11.5, "local"), 0, `${id} local at z11.5`);
    assert.ok(at(opacity, 12, "local") > 0.7, `${id} local at z12`);
    assert.equal(at(opacity, 10.5, "regional"), 0, `${id} regional at z10.5`);
    assert.ok(at(opacity, 11, "regional") > 0.7, `${id} regional at z11`);
    assert.ok(at(opacity, 9, "national") > 0.7, `${id} national at z9`);
  }
  assert.equal(at(byId("trail-halo").paint["line-opacity"], 11.5, "local"), 0);
});

// 508 Mapy draws a hiking stripe about twice as wide as a cycle route's dots
test("walking stripes are about twice as wide as cycle ones from z13 to z16", () => {
  const wide = Object.fromEntries(TRAIL_STRIPE_WALK);
  const thin = Object.fromEntries(TRAIL_STRIPE);
  for (const z of [13, 14, 16]) {
    assert.ok(wide[z] / thin[z] >= 1.6 && wide[z] / thin[z] <= 2.1, `z${z}: ${wide[z]} vs ${thin[z]}`);
  }
});
