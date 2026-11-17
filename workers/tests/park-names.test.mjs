import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, PARK_POINT_CLASSES } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const spec = styleSpec();

const styleOf = (theme = "svetla") => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const passes = (layer, props, zoom) =>
  spec.featureFilter(layer.filter).filter({ zoom }, { type: "Point", properties: props });
const park = { class: "park", subclass: "park", name: "Park Bernolákovo", rank: 10 };

// 540 Mapy names a town park in green and draws no tree; ours drew a tree and lost the name
test("a park point is named in the park's green, not marked by a tree", { skip: !spec && NEEDS_SPEC }, () => {
  const { layers } = styleOf();
  const name = layers.find((l) => l.id === "poi-park-name");
  assert.ok(name, "layer");
  assert.equal(name.paint["text-color"], layers.find((l) => l.id === "park-area-name").paint["text-color"]);
  assert.equal(name.layout["icon-image"], undefined, "no icon");
  assert.ok(passes(name, park, 16));
  assert.ok(!passes(name, { class: "garden", subclass: "garden", rank: 10 }, 16), "an unnamed garden stays empty");
  assert.ok(!passes(name, { class: "cafe", subclass: "cafe", name: "Kačabar", rank: 10 }, 16));
  for (const id of ["poi-major", "poi-all"]) {
    assert.ok(!passes(layers.find((l) => l.id === id), park, 16), `${id} draws no tree`);
  }
});

test("other points of interest keep their icons", { skip: !spec && NEEDS_SPEC }, () => {
  const { layers } = styleOf();
  const museum = { class: "museum", subclass: "museum", name: "Múzeum", rank: 10 };
  assert.ok(passes(layers.find((l) => l.id === "poi-all"), museum, 16));
  assert.deepEqual(PARK_POINT_CLASSES, ["park", "garden"]);
});

test("every theme draws the park names", () => {
  for (const theme of ["svetla", "tmava"]) {
    assert.ok(styleOf(theme).layers.some((l) => l.id === "poi-park-name"), theme);
  }
});
