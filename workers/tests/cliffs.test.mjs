import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, CLIFF_FADE } from "../../poc/web/themes.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  featuresUrl: "https://x/features.pmtiles",
  overrides: normalizeOverrides(saved).overrides
});
const byId = (id) => style.layers.find((l) => l.id === id);
const at = (expr, z) => {
  if (!Array.isArray(expr)) return expr;
  const st = expr.slice(3);
  if (z <= st[0]) return st[1];
  for (let i = 0; i < st.length - 2; i += 2) {
    if (z <= st[i + 2]) return st[i + 1] + ((z - st[i]) / (st[i + 2] - st[i])) * (st[i + 3] - st[i + 1]);
  }
  return st[st.length - 1];
};

// 524 Mapy draws a cliff as a plain dark grey edge: contrast 45 at its z14–z15, 29 at z16, none at z17
test("a cliff is a plain grey edge that fades out close up", () => {
  const cliff = byId("cliff-line");
  assert.equal(byId("cliff-line-teeth"), undefined, "no teeth");
  assert.equal(at(cliff.paint["line-opacity"], 14), 1);
  assert.ok(at(cliff.paint["line-opacity"], 15) > 0 && at(cliff.paint["line-opacity"], 15) < 1);
  assert.equal(at(cliff.paint["line-opacity"], 16), 0);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(cliff.paint["line-color"].slice(i, i + 2), 16));
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 24, "grey, not brown");
  assert.deepEqual(CLIFF_FADE[0], [14, 1]);
});

// 524 embankments and cuttings keep their teeth: only the cliff lost them
test("embankments keep their teeth", () => {
  const teeth = style.layers.filter((l) => l.id.endsWith("-teeth")).map((l) => l.id);
  assert.ok(teeth.length > 0 && !teeth.includes("cliff-line-teeth"), teeth.join(","));
});
