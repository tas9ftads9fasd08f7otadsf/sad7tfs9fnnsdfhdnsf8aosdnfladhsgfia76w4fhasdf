import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, THEMES } from "../../poc/web/themes.js";
import { MAP_TYPE_IDS } from "../../poc/web/map-types.js";

const raw = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));

const luminance = (hex) => [0, 2, 4]
  .map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// 496 TestFlight AOoL: dark side streets nearly vanished into the ground
// 527 a black street stands clear by its light edge, as navigation draws it at night
test("every map type's dark side streets stand clear of the ground", () => {
  const { overrides } = normalizeOverrides(raw);
  const clear = (c) => typeof c !== "string" || contrast(c, THEMES.tmava.residential) >= 1.5;
  const faint = MAP_TYPE_IDS.flatMap((mapType) => {
    const layers = buildStyle({
      theme: "tmava", mapType, overrides,
      tilesUrl: "https://x/t.pmtiles", spriteUrl: "https://x/s",
      glyphsUrl: "https://x/{fontstack}/{range}.pbf", trailsUrl: "https://x/tr.pmtiles"
    }).layers;
    const edge = (id) => layers.find((l) => l.id === `${id}-casing`)?.paint?.["line-color"];
    return layers
      .filter((l) => /^road-(minor|service|pedestrian)$/.test(l.id))
      .filter((l) => !clear(l.paint?.["line-color"]) && !(edge(l.id) && clear(edge(l.id))))
      .map((l) => [mapType, l.id, l.paint?.["line-color"], edge(l.id)].join(" "));
  });
  assert.deepEqual(faint, []);
});

// 527 the edge must carry it: a black street with a black edge would vanish again
test("a dark side street with a dark edge is caught", () => {
  assert.ok(contrast("#000000", THEMES.tmava.residential) < 1.5);
  assert.ok(contrast("#0e0e16", THEMES.tmava.residential) < 1.5, "#496's old near-black edge");
});
