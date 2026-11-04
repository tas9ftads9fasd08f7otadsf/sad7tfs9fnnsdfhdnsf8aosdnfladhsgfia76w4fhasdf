import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, RAMP_SCALE, scaleExpr, valueAtZoom } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const { overrides, problems } = normalizeOverrides(
  JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url))));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 453 interchange loops in Prešov were as wide as the main road; Mapy draws them slim
test("a slip road is narrower than its road", { skip: !spec && NEEDS_SPEC }, () => {
  const width = spec.expression.createExpression(byId("road-primary").paint["line-width"]);
  assert.equal(width.result, "success");
  const at = (properties) => width.value.evaluate({ zoom: 16 }, { type: "LineString", properties });
  const road = at({ class: "primary" });
  assert.equal(at({ class: "primary", ramp: 1 }), road * RAMP_SCALE);
  assert.ok(RAMP_SCALE < 0.7);
});

// 453 the dev panel and outlines read a road's own width through the slip-road factor
test("a road's width still reads and scales as a number", () => {
  const w = byId("road-minor").paint["line-width"];
  assert.equal(typeof valueAtZoom(w, 16), "number");
  const wider = scaleExpr(w, { add: 1 });
  assert.equal(valueAtZoom(wider, 16), valueAtZoom(w, 16) + 1);
});

// 453 Mapy draws parks green and leaves town grassland plain
test("parks are green, not grassland", () => {
  assert.deepEqual(problems, []);
  const [variant] = overrides.maps.turisticka.layers["landcover-grass"].variants;
  assert.deepEqual(variant.values, ["park"]);
  assert.ok(style.layers.some((l) => l.id.startsWith("landcover-grass__var")));
});
