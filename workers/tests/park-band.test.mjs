import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, PARK_BAND } from "../../poc/web/themes.js";

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles"
});

test("a protected area is a band inside its border, not a fill over the land", () => {
  const park = style.layers.find((l) => l.id === "park");
  assert.equal(park.type, "line");
  assert.equal(style.layers.some((l) => l["source-layer"] === "park" && l.type === "fill"), false);
  const widths = park.paint["line-width"].slice(3).filter((_, i) => i % 2 === 1);
  const offsets = park.paint["line-offset"].slice(3).filter((_, i) => i % 2 === 1);
  assert.deepEqual(offsets, widths.map((w) => w / 2), "the band starts at the border, inward");
});

test("the band stays within the 8 px tile buffer, so tile seams inside a park don't show", () => {
  for (const [, width] of PARK_BAND) assert.ok(width <= 8, `${width} px`);
});
