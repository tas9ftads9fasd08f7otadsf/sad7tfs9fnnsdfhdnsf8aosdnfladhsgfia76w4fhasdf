import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";

const style = (demTiles) => buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  demTiles
});

// 579 our height tiles carry Copernicus GLO-30 beyond the state border, so it is credited
test("our terrain credits Copernicus beside its own model", () => {
  const credit = style("pmtiles://https://x/r-terrain.pmtiles").sources.dem.attribution;
  assert.match(credit, /Copernicus DEM/);
  assert.match(credit, /Sonny|ÚGKK/);
});
