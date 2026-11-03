import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, buildStyle } from "../../poc/web/themes.js";
import { MAP_TYPE_IDS } from "../../poc/web/map-types.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

test("zoomed out a park is named from its label point, its outline names it only from z13", () => {
  for (const theme of Object.keys(THEMES)) {
    for (const mapType of MAP_TYPE_IDS) {
      const style = buildStyle({ theme, mapType, tilesUrl: "https://x/tiles.pmtiles",
        spriteUrl: "https://x/sprite", glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" });
      const names = style.layers.filter((l) => l.type === "symbol" && l["source-layer"] === "park");
      assert.ok(names.length > 0, `${mapType} / ${theme} names parks`);
      for (const layer of names) {
        const kinds = layer.filter[1][2][1];
        const where = `${mapType} / ${theme} ${layer.id}`;
        if (kinds.includes("Point")) assert.ok(layer.maxzoom <= 13, where);
        else assert.ok(layer.minzoom >= 13, where);
      }
    }
  }
});

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
});
const layer = (id) => style.layers.find((l) => l.id === id);

const evaluate = (expr, properties, type = "Polygon") => {
  const parsed = spec.expression.createExpression(expr);
  assert.equal(parsed.result, "success", JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom: 14 }, { type, properties });
};

test("a reserve is named with its protection class, a buffer zone not at all", { skip: !spec && NEEDS_SPEC }, () => {
  const { layout, filter } = layer("park-area-name");
  const name = (cls) => evaluate(layout["text-field"], { class: cls, name: "Furkotská dolina" });
  assert.equal(String(name("národná_prírodná_rezervácia")), "NPR Furkotská dolina");
  assert.equal(String(name("national_park")), "Furkotská dolina");
  assert.equal(evaluate(filter, { class: "prírodná_rezervácia" }, "MultiPolygon"), true);
  assert.equal(evaluate(filter, { class: "ochranné_pásmo_národnej_prírodnej_pamiatky" }), false);
});

