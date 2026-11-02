import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, buildStyle } from "../../poc/web/themes.js";

// TestFlight AFFz: a street's name was too small to read while riding.
test("street names are at least 14 at z16 and 19 at z20", () => {
  for (const theme of Object.keys(THEMES)) {
    const style = buildStyle({ theme, tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
      glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" });
    const size = style.layers.find((l) => l.id === "road-name").layout["text-size"];
    const at = (zoom) => size[size.indexOf(zoom, 3) + 1];
    assert.ok(at(16) >= 14, `${theme}: ${at(16)} at z16`);
    assert.ok(at(20) >= 19, `${theme}: ${at(20)} at z20`);
  }
});
