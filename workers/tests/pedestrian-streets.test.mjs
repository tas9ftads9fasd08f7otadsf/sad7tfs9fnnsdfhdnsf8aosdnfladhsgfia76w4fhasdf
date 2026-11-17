import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, ROAD_CASING_FROM_Z } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const styleOf = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const light = styleOf("svetla").layers;
const byId = (layers, id) => layers.find((l) => l.id === id);
const stop = (layer, z) => {
  const e = layer.paint["line-width"];
  for (let i = 3; i < e.length; i += 2) if (e[i] === z) return e[i + 1][1];
  throw new Error(`no stop at z${z}`);
};
const colourAt = (value, z) => {
  if (!Array.isArray(value)) return value;
  let out = value[2];
  for (let i = 3; i < value.length; i += 2) if (value[i] <= z) out = value[i + 1];
  return out;
};

// 543 Mapy fills a pedestrian street pale blue-grey (#e0e5f2); ours were paper-white and vanished
test("a pedestrian street is pale blue-grey by day, as the pedestrian areas are", () => {
  assert.equal(byId(light, "road-pedestrian").paint["line-color"], "#e0e5f2");
  assert.equal(byId(light, "pedestrian-area").paint["fill-color"], "#e0e5f2");
  assert.notEqual(byId(styleOf("tmava").layers, "road-pedestrian").paint["line-color"], "#e0e5f2");
});

// 543 Mapy's pedestrian border is 1.6–1.9 px a side and grey (#bdb5af to #b4b5b6); ours were 0.6 px, tan
test("a pedestrian street has a grey border 1.75 px a side from z13", () => {
  const fill = byId(light, "road-pedestrian");
  const casing = byId(light, "road-pedestrian-casing");
  for (const z of [14, 15, 16]) {
    assert.ok(z >= ROAD_CASING_FROM_Z);
    assert.ok(Math.abs((stop(casing, z) - stop(fill, z)) / 2 - 1.75) < 0.05, `z${z}`);
    const colour = colourAt(casing.paint["line-color"], z);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    assert.ok(Math.abs(r - b) <= 12 && r >= 0xb0 && r <= 0xc8, `z${z} ${colour}`);
  }
});

test("a pedestrian street is as wide as on Mapy at z14 and z15", () => {
  const fill = byId(light, "road-pedestrian");
  assert.ok(Math.abs(stop(fill, 14) - 1.6) < 0.2);
  assert.ok(Math.abs(stop(fill, 15) - 2.5) < 0.25);
});

const drawnBy = (props, zoom = 15) => light.filter((l) => l["source-layer"] === "transportation" && l.type === "line"
  && (!l.filter || spec.featureFilter(l.filter).filter({ zoom }, { type: "LineString", properties: props })))
  .map((l) => l.id);

// 543 the tiles carry a pedestrian street as class path, subclass pedestrian, and no layer drew it
test("a path of subclass pedestrian is drawn as a pedestrian street", { skip: !spec && NEEDS_SPEC }, () => {
  const ids = drawnBy({ class: "path", subclass: "pedestrian" });
  assert.deepEqual(ids, ["road-pedestrian-casing", "road-pedestrian"]);
  assert.deepEqual(drawnBy({ class: "path", subclass: "pedestrian", brunnel: "bridge" }).filter((id) => /bridge$/.test(id)),
    ["road-pedestrian-shadow-bridge", "road-pedestrian-casing-bridge", "road-pedestrian-bridge"]);
  assert.deepEqual(drawnBy({ class: "path", subclass: "pedestrian", brunnel: "tunnel" }).filter((id) => /tunnel$/.test(id)),
    ["road-pedestrian-casing-tunnel", "road-pedestrian-tunnel"]);
});

test("a footway or a path is not drawn as a pedestrian street", { skip: !spec && NEEDS_SPEC }, () => {
  for (const subclass of ["footway", "path", "steps", "cycleway"]) {
    assert.ok(!drawnBy({ class: "path", subclass }).includes("road-pedestrian"), subclass);
  }
  assert.ok(!drawnBy({ class: "service" }).includes("road-pedestrian"));
});
