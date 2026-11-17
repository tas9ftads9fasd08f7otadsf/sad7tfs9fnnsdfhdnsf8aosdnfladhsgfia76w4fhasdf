import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, POWER_TICK } from "../../poc/web/themes.js";

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

// 539 Mapy: a solid #a0a0a0 line with a 5 px tick across it every 60 px; ours was lilac and faint
test("a power line is a grey line with a tick for each pylon", () => {
  const line = byId("feature-power");
  const ticks = byId("feature-power-ticks");
  assert.equal(line.paint["line-color"], "#a0a0a0");
  assert.equal(line.paint["line-dasharray"], undefined, "solid");
  assert.equal(ticks.paint["line-color"], "#a0a0a0");
  assert.equal(ticks.paint["line-width"], POWER_TICK.length);
  const [dash, gap] = ticks.paint["line-dasharray"];
  assert.ok(Math.abs((dash + gap) * POWER_TICK.length - 60) < 0.5, "a tick every 60 px");
  assert.ok(dash * POWER_TICK.length <= 1.2, "a hairline tick");
  assert.equal(ticks.metadata["frico:derived"], "feature-power");
  // Mapy draws low voltage (`power=minor_line`) the same: solid, with ticks
  assert.equal(byId("feature-power-minor").paint["line-dasharray"], undefined, "low voltage is solid");
  assert.equal(byId("feature-power-minor").paint["line-color"], "#a0a0a0");
  assert.match(JSON.stringify(ticks.filter), /power_minor/);
});
