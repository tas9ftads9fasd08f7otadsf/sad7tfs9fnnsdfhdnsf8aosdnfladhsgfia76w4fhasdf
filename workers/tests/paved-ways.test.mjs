import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides, problems } = normalizeOverrides(saved);
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  featuresUrl: "https://x/features.pmtiles",
  overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 508 Mapy draws a paved track or path as a solid road, only unpaved ones dashed
test("paved tracks and paths are solid with an outline, the others stay dashed", () => {
  assert.deepEqual(problems, []);
  for (const id of ["road-track", "road-path"]) {
    assert.ok(byId(id).paint["line-dasharray"], `${id} unpaved stays dashed`);
    assert.equal(byId(`${id}__var1`).paint["line-dasharray"], undefined, `${id} paved is solid`);
    assert.ok(byId(`${id}__var1__outline`), `${id} paved has an outline`);
    assert.match(JSON.stringify(byId(`${id}__var1`).filter), /"paved"/);
    assert.match(JSON.stringify(byId(id).filter), /"paved"/, "the dashed line leaves paved ones out");
  }
});

// 508 Mapy's parking lots are flat white with a thin beige outline
test("a parking lot is opaque and outlined", () => {
  assert.equal(byId("feature-parking").paint["fill-opacity"], 1);
  assert.equal(byId("feature-parking__outline").paint["line-color"], "#c1b79b");
});
