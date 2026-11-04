import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, TRAIL_TYPE_IDS } from "../../poc/web/themes.js";

// 449 `trail` is cut at every junction; names need whole routes or they fit only at z16
test("trail names ride on whole routes, not on the lane pieces", () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    trailsUrl: "https://x/trails.pmtiles"
  });
  for (const id of TRAIL_TYPE_IDS) {
    const label = style.layers.find((l) => l.id === `trail-${id}-label`);
    assert.equal(label["source-layer"], "trail_name", id);
  }
  const schema = readFileSync(new URL("../trails/trails.yml", import.meta.url), "utf8");
  const nameLayer = schema.slice(schema.indexOf("- id: trail_name"), schema.indexOf("examples:"));
  for (const lane of ["side", "off", "lane", "cnt", "way"]) {
    assert.ok(!nameLayer.includes(`key: ${lane}\n`), `${lane} would cut the route into pieces`);
  }
  assert.ok(nameLayer.includes("merge_line_strings"));
});
