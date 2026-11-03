import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, buildStyle, valueAtZoom } from "../../poc/web/themes.js";
import { MAP_TYPE_IDS } from "../../poc/web/map-types.js";

test("a one-way street shows an arrow with a shaft, big and strong enough to read", () => {
  let drawn = 0;
  for (const theme of Object.keys(THEMES)) {
    for (const mapType of MAP_TYPE_IDS) {
      const style = buildStyle({ theme, mapType, tilesUrl: "https://x/tiles.pmtiles",
        spriteUrl: "https://x/sprite", glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" });
      const arrows = style.layers.find((l) => l.id === "road-oneway");
      if (!arrows) continue;
      drawn += 1;
      assert.equal(arrows.layout["icon-image"], "arrow-stick", `${mapType} / ${theme}`);
      assert.ok(valueAtZoom(arrows.layout["icon-size"], 16) >= 0.9, `${mapType} / ${theme} size`);
      assert.ok(arrows.paint["icon-opacity"] >= 0.8, `${mapType} / ${theme} opacity`);
    }
  }
  assert.ok(drawn > 0, "some style draws one-way arrows");
});
