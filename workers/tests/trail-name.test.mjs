import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, TRAIL_TYPE_IDS, TRAIL_REF_MAX_ANGLE } from "../../poc/web/themes.js";

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
  const nameLayer = schema.slice(schema.indexOf("- id: trail_name"), schema.indexOf("- id: trail_mark"));
  for (const lane of ["side", "off", "lane", "cnt", "way"]) {
    assert.ok(!nameLayer.includes(`key: ${lane}\n`), `${lane} would cut the route into pieces`);
  }
  assert.ok(nameLayer.includes("merge_line_strings"));
});

// 533 the merge reversed 17 % of the ways in the published tiles, so those stripes took the other side
test("the stripe layer is not merged, the name layer is", () => {
  const schema = readFileSync(new URL("../trails/trails.yml", import.meta.url), "utf8");
  const stripes = schema.slice(schema.indexOf("- id: trail\n"), schema.indexOf("- id: trail_name"));
  assert.ok(stripes.includes("attributes: &trail_attributes"));
  assert.ok(!stripes.replace(/^\s*#.*$/gm, "").includes("merge_line_strings"));
});

// 556 TestFlight AHUj: a mark stood on every short way of `trail`, a few metres apart in a town
test("trail marks ride on routes merged in the tile, with their lane but no line direction", () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    trailsUrl: "https://x/trails.pmtiles"
  });
  const marks = style.layers.filter((l) => /^trail-.*-(mark|icon)$/.test(l.id));
  assert.ok(marks.length > 0);
  for (const layer of marks) {
    assert.equal(layer["source-layer"], "trail_mark", layer.id);
    assert.equal(layer.layout["icon-rotation-alignment"], "viewport", layer.id);
  }
  const schema = readFileSync(new URL("../trails/trails.yml", import.meta.url), "utf8");
  const markLayer = schema.slice(schema.indexOf("- id: trail_mark"), schema.indexOf("examples:"));
  for (const key of ["route", "mark", "mark_bg", "mark_fg", "side", "off", "lane", "tier"]) {
    assert.ok(markLayer.includes(`key: ${key}\n`), `the marks read ${key}`);
  }
  for (const piece of ["cnt", "way", "name", "ref", "cycleway"]) {
    assert.ok(!markLayer.includes(`key: ${piece}\n`), `${piece} would cut the route into pieces`);
  }
  assert.ok(markLayer.includes("merge_line_strings"));
});

// 563 TestFlight AApL: "2405" bent at 90° and split into "24 05" on a winding trail
test("a trail's number has its own layer that stays straight, names keep theirs", () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    trailsUrl: "https://x/trails.pmtiles"
  });
  for (const id of TRAIL_TYPE_IDS) {
    const ref = style.layers.find((l) => l.id === `trail-${id}-ref`);
    const name = style.layers.find((l) => l.id === `trail-${id}-label`);
    assert.ok(ref, id);
    assert.deepEqual(ref.layout["text-field"], ["get", "ref"], id);
    assert.ok(ref.layout["text-max-angle"] <= TRAIL_REF_MAX_ANGLE, id);
    assert.equal(ref["source-layer"], "trail_name", id);
    assert.ok(JSON.stringify(ref.filter).includes('["!",["has","name"]]'), id);
    assert.ok(JSON.stringify(name.filter).includes('["has","name"]'), id);
    assert.ok(!JSON.stringify(name.filter).includes('"ref"'), `${id} names only`);
  }
});
