import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeOverrides } from "../../poc/web/themes.js";

const sorted = (v) => (Array.isArray(v) ? v.map(sorted)
  : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);

// 569 bug: saving the overrides flattened a paved path's outline, fading in from z15, to always on
test("the committed overrides come back from cleaning as they are", () => {
  const raw = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
  const { overrides, problems } = normalizeOverrides(raw);
  assert.deepEqual(problems, []);
  assert.deepEqual(sorted(overrides.maps), sorted(raw.maps));
  assert.deepEqual(sorted(overrides.layers), sorted(raw.layers));
});

// 569 a variant's outline can fade in by zoom, as the layer's own outline can
test("a variant's outline keeps its opacity by zoom", () => {
  const bands = [[0, 14, 0], [15, 20, 1]];
  const { overrides } = normalizeOverrides({
    version: 2,
    layers: {
      "road-path": {
        variants: [{ attr: "surface", values: ["paved"], outline: { color: "#a9a9b2", width: 1, opacity: bands } }]
      }
    }
  });
  assert.deepEqual(overrides.layers["road-path"].variants[0].outline.opacity, bands);
  const { overrides: plain } = normalizeOverrides({
    version: 2,
    layers: { "road-path": { variants: [{ attr: "surface", values: ["paved"], outline: { color: "#a9a9b2", width: 1, opacity: 3 } }] } }
  });
  assert.equal(plain.layers["road-path"].variants[0].outline.opacity, 1, "a number is still capped");
});

// 569 two writers ordered the file's keys differently, so every save churned it
test("the committed overrides are exactly what saving them writes", async () => {
  const { overridesFile } = await import("../../poc/web/themes.js");
  const text = readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url), "utf8");
  assert.equal(overridesFile(normalizeOverrides(JSON.parse(text)).overrides), text);
});
