import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides } from "../../poc/web/themes.js";

const raw = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));

const styleOf = (theme, overrides) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides
});

const brightness = (hex) => {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? [...c].map((x) => x + x).join("") : c.slice(0, 6);
  return [0, 2, 4].reduce((sum, i) => sum + parseInt(full.slice(i, i + 2), 16), 0) / 3;
};

const colorsIn = (value) => JSON.stringify(value ?? null).match(/#[0-9a-fA-F]{3,8}\b/g) || [];

// 475 the pale grass, gardens and pitches of TestFlight ALYw: light override colours
test("no area of the dark theme is filled with a light colour", () => {
  const { overrides } = normalizeOverrides(raw);
  const pale = styleOf("tmava", overrides).layers
    .filter((l) => l.type === "fill" || l.type === "fill-extrusion")
    .flatMap((l) => colorsIn(l.paint?.["fill-color"] ?? l.paint?.["fill-extrusion-color"])
      .filter((c) => brightness(c) > 120).map((c) => `${l.id} ${c}`));
  assert.deepEqual(pale, []);
});

// 475 the light theme keeps every override colour
test("the light theme still takes an override's colour", () => {
  const { overrides } = normalizeOverrides(raw);
  const grass = styleOf("svetla", overrides).layers.find((l) => l.id === "landcover-grass");
  assert.equal(grass.paint["fill-color"], "#f1f0e5");
});

// 475 an override's own dark colour still wins in the dark theme
test("a dark colour of its own still goes on the layer", () => {
  const { overrides } = normalizeOverrides(raw);
  const residential = styleOf("tmava", overrides).layers.find((l) => l.id === "landuse-residential");
  assert.equal(residential.paint["fill-color"], "#332c1e");
});
