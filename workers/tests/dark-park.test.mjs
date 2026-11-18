import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../poc/web/themes.js";

const luma = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
};

// 550 the protected-area band was the loudest thing on the night map; it stays visible, no more
test("the dark theme's protected-area band is a calm green over its forest", () => {
  const dark = THEMES.tmava;
  assert.ok(luma(dark.park) > luma(dark.forest) + 15, "visible over the forest");
  assert.ok(luma(dark.park) <= 70, `calm: ${dark.park}`);
  assert.ok(luma(dark.parkOutline) <= 90, `outline ${dark.parkOutline}`);
  assert.ok(luma(dark.parkOutline) > luma(dark.park), "the outline is the brighter edge");
});
