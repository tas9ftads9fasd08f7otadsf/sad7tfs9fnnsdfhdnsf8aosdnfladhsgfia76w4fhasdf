import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();
const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

const widthAt = (expr, z) => {
  const base = expr[1][1];
  const st = expr.slice(3);
  for (let i = 0; i < st.length - 2; i += 2) {
    const [z0, v0, z1, v1] = st.slice(i, i + 4);
    if (z <= z1) return v0 + ((base ** (z - z0) - 1) / (base ** (z1 - z0) - 1)) * (v1 - v0);
  }
  return st[st.length - 1];
};
const colourAt = (expr, z) => {
  let out = expr[2];
  for (let i = 3; i < expr.length; i += 2) if (expr[i] <= z) out = expr[i + 1];
  return out;
};

// 528 Mapy's cycleway core in CSS px at our zoom, measured on Bratislava (Mapy z+1)
const MAPY_CORE = { 13: 1.25, 14: 1.25, 15: 1.5, 16: 4 };

test("a cycleway is as wide as Mapy draws it at z13–z16, edge included from z15", () => {
  const core = byId("road-cycleway").paint["line-width"];
  const outline = byId("road-cycleway__outline").paint["line-width"];
  for (const [z, w] of Object.entries(MAPY_CORE)) {
    assert.ok(Math.abs(widthAt(core, Number(z)) - w) / w <= 0.15, `core z${z}`);
  }
  for (const z of [15, 16]) {
    const edge = (widthAt(outline, z) - widthAt(core, z)) / 2;
    assert.ok(Math.abs(edge - 1) <= 0.15, `edge z${z}: ${edge}`);
  }
});

test("a cycleway is brown up to z14 and a pale band from z15", () => {
  const colour = byId("road-cycleway").paint["line-color"];
  assert.equal(colourAt(colour, 14), "#9c9377");
  assert.equal(colourAt(colour, 15), "#e0e5f2");
});

// 528 a paved path marked for bikes was drawn as a dashed hiking path, Mapy draws a cycleway
test("a paved path or footway marked for bikes is a cycleway, not a path", { skip: !spec && NEEDS_SPEC }, () => {
  const takes = (id, props) => spec.featureFilter(byId(id).filter)
    .filter({ zoom: 15 }, { type: 2, properties: { class: "path", ...props } });
  const cases = [
    [{ subclass: "path", bicycle: "designated", surface: "paved" }, "road-cycleway"],
    [{ subclass: "path", bicycle: "designated" }, "road-cycleway"],
    [{ subclass: "footway", bicycle: "designated", surface: "paved" }, "road-cycleway"],
    [{ subclass: "cycleway" }, "road-cycleway"],
    [{ subclass: "path", bicycle: "designated", surface: "unpaved" }, "road-path"],
    [{ subclass: "path", bicycle: "yes" }, "road-path"],
    [{ subclass: "path" }, "road-path"],
    [{ subclass: "footway", bicycle: "yes" }, "road-footway"],
    [{ subclass: "footway", bicycle: "designated", surface: "unpaved" }, "road-footway"]
  ];
  for (const [props, expected] of cases) {
    const drawn = ["road-cycleway", "road-path", "road-footway"].filter((id) => takes(id, props));
    assert.deepEqual(drawn, [expected], JSON.stringify(props));
  }
});

// 532 an unpaved cycleway was a pale band; Mapy dashes it like a track (12.75/4 px at z15, as tracks)
test("an unpaved cycleway is drawn by the track layer, not the cycleway one", { skip: !spec && NEEDS_SPEC }, () => {
  const takes = (id, props) => spec.featureFilter(byId(id).filter)
    .filter({ zoom: 15 }, { type: 2, properties: { class: "path", ...props } });
  const drawn = (props) => ["road-cycleway", "road-track", "road-path"].filter((id) => takes(id, props));
  assert.deepEqual(drawn({ subclass: "cycleway", surface: "unpaved" }), ["road-track"]);
  assert.deepEqual(drawn({ subclass: "cycleway", surface: "paved" }), ["road-cycleway"]);
  assert.deepEqual(drawn({ subclass: "cycleway" }), ["road-cycleway"]);
  assert.deepEqual(drawn({ subclass: "path", bicycle: "designated", surface: "unpaved" }), ["road-path"]);
  const filter = spec.featureFilter(byId("road-track").filter);
  assert.equal(filter.filter({ zoom: 15 }, { type: 2, properties: { class: "track" } }), true);
});
