import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

test("an outline fades in by zoom bands, a plain number stays a number", { skip: !spec && NEEDS_SPEC }, () => {
  const { overrides, problems } = normalizeOverrides({
    maps: { turisticka: { layers: {
      "road-footway": { outline: { color: "#a9a9b2", width: 1, opacity: [[0, 14, 0], [15, 20, 1]] } },
      "road-path": { outline: { color: "#828285", width: 1, opacity: 0.5 } }
    } } }
  });
  assert.deepEqual(problems, []);
  const style = buildStyle({
    theme: "svetla",
    mapType: "turisticka",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
    overrides
  });
  const byId = Object.fromEntries(style.layers.map((l) => [l.id, l]));
  const fade = byId["road-footway__outline"].paint["line-opacity"];
  assert.equal(fade[0], "step", "bands become a zoom step");
  assert.equal(byId["road-path__outline"].paint["line-opacity"], 0.5);
  if (spec) assert.deepEqual(spec.validateStyleMin(style).map((e) => e.message), []);
});

test("an outline opacity out of range is refused", () => {
  const { problems } = normalizeOverrides({
    layers: { "road-footway": { outline: { color: "#a9a9b2", width: 1, opacity: [[0, 20, -1]] } } }
  });
  assert.ok(problems.length > 0);
});
