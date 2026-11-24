import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, THEMES, VALLEY_NAME_MIN_Z, VALLEY_TEXT_SIZE, VALLEY_LETTER_SPACING
} from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  namesUrl: "https://x/names.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 566 bug: Čertova dolina is a line in the names package; only valley points were named
test("a valley drawn as a line is named along it, once, from Mapy's z14", { skip: !spec && NEEDS_SPEC }, () => {
  const line = byId("names-valley-line");
  assert.equal(line["source-layer"], "valley");
  assert.equal(line.layout["symbol-placement"], "line-center", "once in the middle, not repeated");
  assert.equal(line.minzoom, VALLEY_NAME_MIN_Z);
  assert.equal(VALLEY_NAME_MIN_Z, 13, "Mapy's z14; its z13 names no valley");
  const filter = spec.expression.createExpression(line.filter).value;
  assert.equal(filter.evaluate({ zoom: 14 }, { type: "LineString", properties: {} }), true);
  assert.equal(filter.evaluate({ zoom: 14 }, { type: "Point", properties: {} }), false);
  assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});

// 566 Mapy writes a valley in spaced lower-case italics in dark brown, not in the capitals of ranges
test("a valley's name is spaced italics in Mapy's dark brown, as a point too", () => {
  for (const id of ["names-valley-line", "names-valley"]) {
    const { layout, paint } = byId(id);
    assert.equal(layout["text-transform"], undefined, id);
    assert.equal(layout["text-letter-spacing"], VALLEY_LETTER_SPACING, id);
    assert.match(layout["text-font"][0], /Italic/, id);
    assert.equal(paint["text-color"], THEMES.svetla.valleyText, id);
  }
  assert.equal(THEMES.svetla.valleyText, "#453833");
  assert.ok(VALLEY_LETTER_SPACING >= 0.25, "letters well apart");
  // a 135 px valley at z13 holds Čertova dolina only up to 11 px
  assert.ok(VALLEY_TEXT_SIZE[0][1] <= 11);
});

// 566 the names tiles cut a valley at the tile edge, 8 px on, too short for its name
test("the names package keeps a valley's line well past the tile edge", () => {
  const yml = readFileSync(new URL("../names/names.yml", import.meta.url), "utf8");
  const valley = /- id: valley\n((?: {4}.*\n|\s*\n)*)/.exec(yml)[1];
  const buffer = Number(/^\s+buffer: (\d+)/m.exec(valley)?.[1]);
  assert.ok(buffer >= 64, `buffer ${buffer}`);
});
