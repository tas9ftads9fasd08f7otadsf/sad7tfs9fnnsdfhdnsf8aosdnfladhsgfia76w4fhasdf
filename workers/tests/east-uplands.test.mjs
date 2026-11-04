import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
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
const evaluate = (expr, properties) => {
  const parsed = spec.expression.createExpression(expr);
  assert.equal(parsed.result, "success", JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom: 14 }, { type: "Polygon", properties });
};

// 450 Mapy browns allotments; 453 the green grass variant is parks (city.test.mjs)
test("allotments are a variant of their own", () => {
  assert.deepEqual(problems, []);
  const grass = style.layers.find((l) => l.id.startsWith("landcover-grass__var"));
  const garden = style.layers.find((l) => l.id.startsWith("landcover-garden__var"));
  assert.deepEqual(overrides.maps.turisticka.layers["landcover-garden"].variants[0].values, ["allotments"]);
  assert.ok(garden);
  assert.notDeepEqual(grass.paint["fill-color"], byId("landcover-grass").paint["fill-color"]);
});

// 450 the state border is a soft band with a dashed line, region borders go close up
test("the state border is a band with a dashed line, region borders end at z13", () => {
  assert.ok(byId("boundary-country").paint["line-blur"]);
  assert.ok(byId("boundary-country-line").paint["line-dasharray"]);
  assert.ok(style.layers.indexOf(byId("boundary-country")) < style.layers.indexOf(byId("boundary-country-line")));
  assert.equal(byId("boundary-region").maxzoom, 13);
});

// 450 OSM spells the title out; Mapy writes "CHKO Východné Karpaty"
test("a protected landscape area is named CHKO", { skip: !spec && NEEDS_SPEC }, () => {
  const field = byId("park-area-name").layout["text-field"];
  assert.equal(evaluate(field, { class: "chránená_krajinná_oblasť", name: "Chránená krajinná oblasť Východné Karpaty" }),
    "CHKO Východné Karpaty");
  assert.equal(evaluate(field, { class: "chránená_krajinná_oblasť", name: "Poloniny" }), "CHKO Poloniny");
  assert.equal(evaluate(field, { class: "prírodná_rezervácia", name: "Pod Beskydom" }), "PR Pod Beskydom");
});
