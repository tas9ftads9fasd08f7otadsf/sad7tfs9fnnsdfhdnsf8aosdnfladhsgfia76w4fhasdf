import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, buildStyle, valueAtZoom } from "../../poc/web/themes.js";
import { MAP_TYPE_IDS } from "../../poc/web/map-types.js";

test("zoomed in, a street's name is repeated at most once a phone's screen", () => {
  for (const theme of Object.keys(THEMES)) {
    for (const mapType of MAP_TYPE_IDS) {
      const style = buildStyle({ theme, mapType, tilesUrl: "https://x/tiles.pmtiles",
        spriteUrl: "https://x/sprite", glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" });
      const names = style.layers.find((l) => l.id === "road-name");
      assert.ok(names, `${mapType} / ${theme} names streets`);
      const spacing = names.layout["symbol-spacing"];
      assert.ok(spacing !== undefined && valueAtZoom(spacing, 18.5) >= 600, `${mapType} / ${theme} at z18.5`);
      assert.ok(valueAtZoom(spacing, 13) <= 300, `${mapType} / ${theme} keeps names zoomed out`);
    }
  }
});
