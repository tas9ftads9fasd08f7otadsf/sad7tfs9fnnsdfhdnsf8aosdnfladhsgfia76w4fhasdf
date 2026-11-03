import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, buildStyle, valueAtZoom } from "../../poc/web/themes.js";

// metres a style pixel covers at z18.5 over Slovakia
const METRES_PER_PX = (40075016 * Math.cos((48.5 * Math.PI) / 180)) / (512 * 2 ** 18.5);

test("zoomed in close, a town street is drawn no wider than a town street is", () => {
  const style = buildStyle({ theme: Object.keys(THEMES)[0], tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite", glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" });
  for (const id of ["road-minor", "road-service", "road-pedestrian"]) {
    const layer = style.layers.find((l) => l.id === id);
    assert.ok(layer, `${id} is drawn`);
    const metres = valueAtZoom(layer.paint["line-width"], 18.5) * METRES_PER_PX;
    assert.ok(metres <= 6, `${id} is ${metres.toFixed(1)} m wide at z18.5`);
    assert.ok(valueAtZoom(layer.paint["line-width"], 16) >= 5, `${id} keeps its width at z16`);
  }
});
