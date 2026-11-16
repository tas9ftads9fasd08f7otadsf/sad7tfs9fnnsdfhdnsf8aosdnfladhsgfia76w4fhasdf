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
// the stripe width between its breaks, interpolated `exponential 1.5` as the style does
const at15 = (stops, z) => {
  const i = stops.findIndex(([sz]) => sz >= z);
  if (stops[i][0] === z) return stops[i][1];
  const [[z0, v0], [z1, v1]] = [stops[i - 1], stops[i]];
  return v0 + ((1.5 ** (z - z0) - 1) / (1.5 ** (z1 - z0) - 1)) * (v1 - v0);
};
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
// 512 with Mapy's shorter dashes and gaps
test("cycle routes are short dashes at every zoom", () => {
  const bike = byId("trail-bicycle");
  assert.deepEqual(bike.paint["line-dasharray"], dashValue("dashed-short"));
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

// 509 measured on 44 random tiles: Mapy's hiking stripe is as wide as its cycle dashes
// up to its z16 and barely wider at z17; ours was 1.5–2× wider
test("walking stripes are as wide as cycle ones at z13–z14 and at most 1.4× wider at z16", () => {
  const walk = Object.fromEntries(TRAIL_STRIPE_WALK);
  const bike = Object.fromEntries(TRAIL_STRIPE);
  for (const z of [13, 14]) {
    assert.ok(Math.abs(walk[z] - bike[z]) <= 0.25, `z${z}: ${walk[z]} vs ${bike[z]}`);
  }
  assert.ok(walk[16] >= bike[16] && walk[16] / bike[16] <= 1.4, `z16: ${walk[16]} vs ${bike[16]}`);
});

// 512 Mapy's cycle dashes are 3.25–3.75 px with 2.5 px gaps from its z13 to z16; ours were longer
test("cycle dashes are Mapy's length and gap at z12–z15", () => {
  const [dash, gap] = dashValue("dashed-short");
  const width = Object.fromEntries([12, 13, 14, 15].map((z) => [z, at15(TRAIL_STRIPE, z)]));
  const mapy = { 12: [3.25, 2.5], 13: [3.5, 2.5], 14: [3.75, 2.5], 15: [3.75, 2.5] };
  for (const [z, [d, g]] of Object.entries(mapy)) {
    assert.ok(Math.abs(dash * width[z] - d) / d <= 0.2, `z${z}: dash ${(dash * width[z]).toFixed(2)} vs ${d}`);
    assert.ok(Math.abs(gap * width[z] - g) / g <= 0.2, `z${z}: gap ${(gap * width[z]).toFixed(2)} vs ${g}`);
  }
});
