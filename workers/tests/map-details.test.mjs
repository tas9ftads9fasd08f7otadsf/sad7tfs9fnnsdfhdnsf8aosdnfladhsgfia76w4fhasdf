import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, ROAD_DEFS } from "../../poc/web/themes.js";
import { PATTERN_IDS, collectPatternNames } from "../../poc/web/patterns.js";
import { renderMark, markShape, MARK_PAD } from "../../poc/web/marks.js";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const { overrides, problems } = normalizeOverrides(saved);
const withTrails = (theme) => buildStyle({
  theme, mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", trailsUrl: "https://x/trails.pmtiles", overrides
});
const build = (theme) => buildStyle({
  theme, mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", featuresUrl: "https://x/features.pmtiles", overrides
});
const style = build("svetla");
const byId = (id) => style.layers.find((l) => l.id === id);

// 548 Mapy draws a vine on every vineyard, a cross on every grave field and the voltage on a power line
test("vineyards carry vine icons from z14, in their own colour", () => {
  assert.deepEqual(problems, []);
  assert.ok(PATTERN_IDS.includes("vines"));
  const icons = byId("landcover-vineyard-icons");
  assert.equal(icons.minzoom, 14);
  assert.match(icons.paint["fill-pattern"], /^pat:vines:/);
  assert.match(JSON.stringify(icons.filter), /"vineyard"/);
  assert.ok(collectPatternNames(style).some((n) => n.startsWith("pat:vines:")), "the pipeline bakes it");
  assert.equal(byId("landcover-garden__var3").paint["fill-color"], "#e0ecc3");
});

test("cemeteries are filled with grave crosses", () => {
  assert.match(byId("landuse-cemetery__pattern").paint["fill-pattern"], /^pat:cross:/);
});

test("a power line says its voltage in kV, from z14", () => {
  const label = byId("feature-power-label");
  assert.equal(label.minzoom, 14);
  assert.equal(label.layout["symbol-placement"], "line");
  assert.deepEqual(label.layout["text-field"].slice(0, 1), ["concat"]);
  assert.match(JSON.stringify(label.layout["text-field"]), /kV/);
  assert.match(JSON.stringify(label.filter), /power_line/);
});

test("every theme has a vine colour", () => {
  for (const theme of ["svetla", "tmava", "outdoor", "retro"]) {
    const vines = build(theme).layers.find((l) => l.id === "landcover-vineyard-icons");
    assert.match(vines.paint["fill-pattern"], /^pat:vines:[0-9a-f]{6}:/, theme);
  }
});

// 548 a primary road's fill was 25 to 30 % wider than a secondary one, Mapy draws it about as wide
test("a primary road is hardly wider than a secondary one", () => {
  const stops = (id) => Object.fromEntries(ROAD_DEFS.find((d) => d[0] === id)[5]);
  for (const z of [14, 16]) {
    const ratio = stops("primary")[z] / stops("secondary")[z];
    assert.ok(ratio >= 1 && ratio <= 1.1, `z${z}: ${ratio.toFixed(2)}`);
  }
});

// 548 Mapy.com's route marks are small rounded squares, not tall stacks of legend plates
test("a route mark has rounded corners", () => {
  const { width, data } = renderMark(markShape("bar"), "#ffffff", "#d42a2a", 1);
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.ok(alpha(MARK_PAD, MARK_PAD) < 128, "the corner is cut");
  assert.equal(alpha(Math.floor(width / 2), Math.floor(width / 2)), 255, "the middle is full");
  assert.equal(alpha(Math.floor(width / 2), MARK_PAD + 3), 255, "the edge midpoint is full");
});

test("only the first two routes of a lane get a mark", () => {
  const marks = withTrails("svetla").layers.filter((l) => /^trail-.*-mark$/.test(l.id));
  assert.ok(marks.length > 0);
  for (const l of marks) assert.match(JSON.stringify(l.filter), /"<=".*1\]/s, l.id);
});

// 549 Mapy's paths and tracks are lighter and about a third thinner than ours were
test("paths and tracks are drawn in Mapy's light brown, thin", () => {
  const track = byId("road-track");
  const path = byId("road-path");
  assert.equal(track.paint["line-color"], "#9b9275");
  assert.equal(path.paint["line-color"], "#968c70");
  for (const layer of [track, path]) assert.ok(layer.paint["line-dasharray"], `${layer.id} stays dashed`);
});

// 549 our contours were two to four times as strong as Mapy's; the 50 and 100 m lines are fainter and thinner
test("contour lines are faint close up, the 100 m ones thin", () => {
  const lines = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", contoursUrl: "https://x/contours.pmtiles", overrides
  });
  // close up (the last step) the opacity is the expression's last value
  const closeUp = (id) => lines.layers.find((l) => l.id === id).paint["line-opacity"].at(-1);
  for (const id of ["contour-minor", "contour-mid", "contour-major"]) {
    assert.ok(closeUp(id) <= 0.3, `${id} ${closeUp(id)}`);
  }
  const widthAt16 = (id) => {
    const w = lines.layers.find((l) => l.id === id).paint["line-width"];
    return w[w.indexOf(16) + 1];
  };
  assert.ok(widthAt16("contour-major") <= 1.2, "the 100 m line is about 1 px");
});

// 549 Mapy's mountain-bike route is bold round dots
test("a mountain-bike route is drawn in bold dots", () => {
  const trails = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", trailsUrl: "https://x/trails.pmtiles", overrides
  });
  assert.deepEqual(trails.layers.find((l) => l.id === "trail-mtb").paint["line-dasharray"], [1.5, 1.2]);
});
