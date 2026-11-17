import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../poc/web/themes.js";

const luma = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
};

// 508 dark rocks sank into the dark ground; they stay visibly lighter than it
test("the dark theme's rocks are lighter than its ground", () => {
  const dark = THEMES.tmava;
  assert.ok(luma(dark.rockArea) >= 80, `rockArea ${dark.rockArea}`);
  assert.ok(luma(dark.rock) >= 65, `rock ${dark.rock}`);
  assert.ok(luma(dark.rockArea) - luma(dark.background) >= 40, "against the ground");
  assert.ok(luma(dark.rockArea) < luma(THEMES.svetla.rockArea), "still darker than by day");
});
