import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides: normalizeOverrides(saved)
});
const byId = (id) => style.layers.find((l) => l.id === id);
const mentionsCycleway = (filter) => JSON.stringify(filter).includes('"cycleway"');

// 510 Mapy draws a cycle route on a cycleway as a solid stripe, elsewhere dashed
test("a cycle route is dashed off cycleways and solid on them", () => {
  const dashed = byId("trail-bicycle");
  const solid = byId("trail-bicycle-solid");
  assert.ok(dashed.paint["line-dasharray"], "dashed off cycleways");
  assert.equal(solid.paint["line-dasharray"], undefined);
  assert.ok(JSON.stringify(dashed.filter).includes('["!",'), "the dashed layer leaves cycleways out");
  assert.ok(mentionsCycleway(dashed.filter) && mentionsCycleway(solid.filter));
  for (const prop of ["line-color", "line-width", "line-offset", "line-opacity"]) {
    assert.deepEqual(solid.paint[prop], dashed.paint[prop], prop);
  }
  assert.equal(solid.metadata["frico:derived"], "trail-bicycle");
  assert.equal(style.layers.indexOf(solid), style.layers.indexOf(dashed) + 1);
});

// 510 walking routes keep one layer: Mapy draws them solid everywhere
test("only cycle routes get a cycleway layer", () => {
  assert.equal(style.layers.filter((l) => /^trail-.*-solid$/.test(l.id)).length, 1);
  assert.equal(byId("trail-hiking").filter.length, 3);
});
