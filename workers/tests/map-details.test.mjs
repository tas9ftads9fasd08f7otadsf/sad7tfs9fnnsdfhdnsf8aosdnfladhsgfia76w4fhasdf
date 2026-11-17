import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { PATTERN_IDS, collectPatternNames } from "../../poc/web/patterns.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides, problems } = normalizeOverrides(saved);
const build = (theme) => buildStyle({
  theme, mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", featuresUrl: "https://x/features.pmtiles", overrides
});
const style = build("svetla");
const byId = (id) => style.layers.find((l) => l.id === id);

// 508 Mapy draws a vine on every vineyard, a cross on every grave field and the voltage on a power line
test("vineyards carry vine icons from z14, in their own colour", () => {
  assert.deepEqual(problems, []);
  assert.ok(PATTERN_IDS.includes("vines"));
  const icons = byId("landcover-vineyard-icons");
  assert.equal(icons.minzoom, 14);
  assert.match(icons.paint["fill-pattern"], /^pat:vines:/);
  assert.match(JSON.stringify(icons.filter), /"vineyard"/);
  assert.ok(collectPatternNames(style).some((n) => n.startsWith("pat:vines:")), "the pipeline bakes it");
  assert.equal(byId("landcover-garden__var3").paint["fill-color"], "#e0ecc3");
});

test("cemeteries are filled with grave crosses", () => {
  assert.match(byId("landuse-cemetery__pattern").paint["fill-pattern"], /^pat:cross:/);
});

test("a power line says its voltage in kV, from z14", () => {
  const label = byId("feature-power-label");
  assert.equal(label.minzoom, 14);
  assert.equal(label.layout["symbol-placement"], "line");
  assert.deepEqual(label.layout["text-field"].slice(0, 1), ["concat"]);
  assert.match(JSON.stringify(label.layout["text-field"]), /kV/);
  assert.match(JSON.stringify(label.filter), /power_line/);
});

test("every theme has a vine colour", () => {
  for (const theme of ["svetla", "tmava", "outdoor", "retro"]) {
    const vines = build(theme).layers.find((l) => l.id === "landcover-vineyard-icons");
    assert.match(vines.paint["fill-pattern"], /^pat:vines:[0-9a-f]{6}:/, theme);
  }
});
