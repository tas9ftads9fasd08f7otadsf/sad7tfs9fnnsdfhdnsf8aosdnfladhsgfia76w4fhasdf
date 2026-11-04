import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, TRAIL_MARK_STACK } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides, problems } = normalizeOverrides(saved);
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

// 446 Mapy draws alpine grass pale grey-green and dwarf pine green; one fill can't do both
test("alpine grass is a variant of its own, paler than dwarf pine", () => {
  assert.deepEqual(problems, []);
  const fell = style.layers.find((l) => l.id.startsWith("landcover-scrub__var"));
  assert.ok(fell, "fell variant");
  assert.ok(JSON.stringify(fell.filter).includes("fell"));
  assert.notDeepEqual(fell.paint["fill-color"], byId("landcover-scrub").paint["fill-color"]);
});

// 446 a hiking mark hangs just below its path, not a box and a half above it
test("hiking marks sit just below the path, the other side's above it", () => {
  const offset = byId("trail-hiking-mark").layout["icon-offset"];
  const pairs = offset.slice(1, -1);
  const at = (side, off) => {
    const i = pairs.findIndex((c, j) => j % 2 === 0
      && JSON.stringify(c).includes(`["==",["coalesce",["get","side"],1],${side}]`)
      && JSON.stringify(c).includes(`${off}]`));
    return pairs[i + 1][1][1];
  };
  assert.equal(at(1, 0), TRAIL_MARK_STACK.base);
  assert.ok(at(1, 0) > 0 && at(1, 0) < 16, "just below");
  assert.ok(at(-1, 0) < 0, "the other side above");
});

// 446 "0930 Tatranská magistrála" never fit a mountain bend; Mapy writes the name alone
test("trail labels show the name alone and allow winding paths", () => {
  const label = byId("trail-hiking-label").layout;
  assert.equal(label["text-max-angle"], 60);
  assert.equal(label["text-field"][1][0], "has");
  assert.deepEqual(label["text-field"][2], ["get", "name"]);
});

// 446 rock reads as rock: darker than the scree around it at every zoom
test("steep rock is darker than scree", () => {
  const light = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  const bands = (id) => overrides.maps.turisticka.layers[id].paint["fill-color"];
  for (const z of [10, 12, 13, 15, 18]) {
    const at = (id) => bands(id).find(([from, to]) => from <= z && z <= to)[2];
    assert.ok(light(at("rock-area")) < light(at("landcover-rock")), `z${z}`);
  }
});
