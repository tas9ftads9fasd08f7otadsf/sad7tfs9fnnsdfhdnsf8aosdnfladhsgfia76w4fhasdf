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
  overrides: normalizeOverrides(saved).overrides
});
const index = (id) => style.layers.findIndex((l) => l.id === id);

// 538 MapLibre places the last layer's labels first; in Bratislava's old town the palace POIs took
// every spot and "Panská" and "Ventúrska" went unnamed, though Mapy names them
test("a street name is placed before every point of interest", () => {
  const pois = style.layers.filter((l) => /^poi-/.test(l.id));
  assert.ok(pois.length >= 4);
  for (const poi of pois) assert.ok(index("road-name") > index(poi.id), poi.id);
});

// 538 but names of places, peaks and parks still win over a street's
test("places and peaks stay above street names", () => {
  for (const id of ["place-city", "place-village", "mountain-peak"]) {
    assert.ok(index(id) > index("road-name"), id);
  }
});
