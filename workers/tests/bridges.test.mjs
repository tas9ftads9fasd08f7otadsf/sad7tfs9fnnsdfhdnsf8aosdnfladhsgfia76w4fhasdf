import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, ROAD_DEFS, BRIDGE_SHADOW, THEMES } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const build = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const style = build("svetla");
const index = (id) => style.layers.findIndex((l) => l.id === id);

// 521 a bridge kept its road's own edge; Mapy edges every bridge in grey (#818180)
test("every road class has grey edges on a bridge", () => {
  for (const [id] of ROAD_DEFS) {
    const casing = style.layers[index(`road-${id}-casing-bridge`)];
    assert.equal(casing.paint["line-color"], "#818180", id);
    assert.notEqual(style.layers[index(`road-${id}-casing`)].paint["line-color"], "#818180", `${id} off a bridge`);
  }
});

// 521 Mapy lets a bridge cast a soft shadow south-east, away from the hillshade's light
test("a bridge casts a soft shadow under its edges", () => {
  for (const [id] of ROAD_DEFS) {
    const shadow = style.layers[index(`road-${id}-shadow-bridge`)];
    assert.ok(shadow, id);
    assert.ok(index(`road-${id}-shadow-bridge`) < index(`road-${id}-casing-bridge`), `${id} under its edge`);
    assert.deepEqual(shadow.paint["line-translate"], BRIDGE_SHADOW.translate);
    assert.equal(shadow.paint["line-translate-anchor"], "map");
    assert.ok(shadow.paint["line-blur"] > 0 && shadow.paint["line-opacity"] <= 0.25);
    assert.ok(shadow.minzoom >= BRIDGE_SHADOW.minzoom);
  }
  assert.equal(style.layers.some((l) => /-shadow$/.test(l.id) || /-shadow-tunnel$/.test(l.id)), false);
});

// 521 the new inks are in every theme, so the dark one keeps its own bridges
test("every theme has a bridge edge and shadow colour", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const palette = theme.colors || theme.palette || theme;
    assert.match(String(palette.bridgeCasing), /^#[0-9a-f]{6}$/i, name);
    assert.match(String(palette.bridgeShadow), /^#[0-9a-f]{6}$/i, name);
  }
});

// 522 bug: the shadow was sized from the old borders, so it stood out unevenly past #519's edges
test("a bridge's shadow reaches the same width beyond its edge on every road", () => {
  const stops = (expr) => {
    const out = {};
    for (let i = 3; i < expr.length; i += 2) out[expr[i]] = expr[i + 1][1];
    return out;
  };
  for (const [id] of ROAD_DEFS) {
    const shadow = stops(style.layers[index(`road-${id}-shadow-bridge`)].paint["line-width"]);
    const casing = stops(style.layers[index(`road-${id}-casing-bridge`)].paint["line-width"]);
    for (const z of Object.keys(casing)) {
      assert.ok(Math.abs((shadow[z] - casing[z]) / 2 - BRIDGE_SHADOW.spread) < 1e-9, `${id} z${z}`);
    }
  }
});
