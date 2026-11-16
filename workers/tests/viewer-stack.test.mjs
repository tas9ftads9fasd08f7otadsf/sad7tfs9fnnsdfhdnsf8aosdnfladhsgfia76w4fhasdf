// 514 the web viewer drew the pipeline's order; Riki Maps draws its default package stack
import test from "node:test";
import assert from "node:assert/strict";
import { regionStyle } from "../../poc/web/region-style.js";
import { DEFAULT_STACK, packageOf, stackPackages } from "../../poc/web/packages.js";

const archives = Object.fromEntries(["contours", "rocks", "trails", "water", "points", "transport",
  "boundaries", "buildings", "features"].map((k) => [k, `tiles/r-${k}.pmtiles`]));
const region = { name: "R", pmtiles: "tiles/r.pmtiles", ...archives };
const style = regionStyle({
  manifest: { regions: { r: region } }, regionKey: "r", baseUrl: "http://x",
  set: null, overrides: {}, theme: "svetla", mapType: undefined, languages: []
});
const band = (l) => ({ background: -1, fill: 0, hillshade: 0, "fill-extrusion": 2, symbol: 3 })[l.type] ?? 1;
// 523 a town's built-up ground lies under every package's areas
const rank = (l) => (l.metadata?.["riki:ground"] && band(l) === 0 ? -1 : DEFAULT_STACK.indexOf(packageOf(l)));

test("the stack is Riki Maps' DefaultStack, ground first and settlements last", () => {
  assert.deepEqual(DEFAULT_STACK, ["landscape", "rocks", "terrain", "water", "contours", "paths",
    "roads", "railways", "ski", "boundaries", "points", "history", "names", "settlements"]);
});

test("areas lie under lines, lines under 3D, labels on top", () => {
  const bands = style.layers.map(band);
  assert.deepEqual(bands, [...bands].sort((a, b) => a - b));
});

// 520 Mapy draws a route stripe under the roads, over the paths it marks
test("within a band the packages follow the stack, marked routes with the paths under the roads", () => {
  for (const b of [0, 1]) {
    const ranks = style.layers.filter((l) => band(l) === b).map(rank);
    assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y), `band ${b}`);
  }
  const lines = style.layers.filter((l) => band(l) === 1);
  const firstRoad = lines.findIndex((l) => packageOf(l) === "roads");
  const lastTrail = Math.max(...lines.map((l, i) => (l.id.startsWith("trail-") ? i : -1)));
  assert.ok(lastTrail >= 0 && lastTrail < firstRoad, "marked routes under the roads");
});

test("a package keeps its own order and labels keep the pipeline's", () => {
  const built = { ...style, layers: [...style.layers].reverse() };
  const again = stackPackages(stackPackages(built));
  assert.deepEqual(again.layers.map((l) => l.id), stackPackages(built).layers.map((l) => l.id));
  const water = style.layers.filter((l) => packageOf(l) === "water" && band(l) === 1).map((l) => l.id);
  assert.ok(water.indexOf("waterway-river") >= 0);
  const symbols = style.layers.filter((l) => l.type === "symbol").map((l) => l.id);
  const unstacked = stackPackages({ ...style, layers: style.layers.filter((l) => l.type === "symbol") });
  assert.deepEqual(unstacked.layers.map((l) => l.id), symbols);
});

// 523 Mapy draws a town's parks and woods over its built-up area
test("a town's built-up area lies under every other area", () => {
  const areas = style.layers.filter((l) => band(l) === 0);
  const ground = areas.map((l, i) => (l.metadata?.["riki:ground"] ? i : -1)).filter((i) => i >= 0);
  assert.ok(ground.length >= 1);
  assert.deepEqual(ground, ground.map((_, i) => i));
  assert.ok(areas.findIndex((l) => l.id === "landcover-wood") > Math.max(...ground));
});
