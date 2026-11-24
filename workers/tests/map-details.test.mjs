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
// 570 the 25 m class is gone, and the owner wants the lines bolder: still translucent, the index under 1.5 px
test("contour lines are translucent close up, the index ones thin", () => {
  const lines = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", contoursUrl: "https://x/contours.pmtiles", overrides
  });
  // close up (the last step) the opacity is the expression's last value
  const closeUp = (id) => lines.layers.find((l) => l.id === id).paint["line-opacity"].at(-1);
  for (const id of ["contour-minor", "contour-major"]) {
    assert.ok(closeUp(id) <= 0.5, `${id} ${closeUp(id)}`);
  }
  const widthAt16 = (id) => {
    const w = lines.layers.find((l) => l.id === id).paint["line-width"];
    return w[w.indexOf(16) + 1];
  };
  assert.ok(widthAt16("contour-major") <= 1.5, "the index line is about 1.5 px");
});

// 549 Mapy's mountain-bike route is bold round dots
test("a mountain-bike route is drawn in bold dots", () => {
  const trails = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", trailsUrl: "https://x/trails.pmtiles", overrides
  });
  assert.deepEqual(trails.layers.find((l) => l.id === "trail-mtb").paint["line-dasharray"], [1.5, 1.2]);
});

// 553 route names and numbers were left off: at 420 px spacing and 60° a winding route got no label
test("a route's name is tried every 170 to 230 px and may bend 90°", () => {
  const trails = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", trailsUrl: "https://x/trails.pmtiles", overrides
  });
  const labels = trails.layers.filter((l) => /^trail-.*-label$/.test(l.id));
  assert.ok(labels.length >= 5);
  for (const l of labels) {
    assert.equal(l.layout["text-max-angle"], 90, l.id);
    const spacing = l.layout["symbol-spacing"].filter((v) => typeof v === "number" && v > 100);
    assert.ok(spacing.every((v) => v <= 250), `${l.id} ${spacing}`);
  }
});

// 554 Mapy's dashes on a track lengthen with the zoom (about 6, 12, 16 line widths); ours stayed at 4
test("tracks and paths are dashed longer the closer you look", () => {
  for (const id of ["road-track", "road-path"]) {
    const dash = byId(id).paint["line-dasharray"];
    assert.equal(dash[0], "step", id);
    const lengths = [dash[2], dash[4], dash[6]].map((a) => a[1][0]);
    assert.ok(lengths[0] < lengths[1] && lengths[1] < lengths[2], `${id} ${lengths}`);
    assert.ok(lengths[2] >= 14, `${id} closest dash ${lengths[2]}`);
  }
});

// 554 Mapy writes the number after the slash on a house, ours "120/54"
test("a house number shows the part after the slash", () => {
  const field = byId("housenumber").layout["text-field"];
  assert.equal(field[0], "let");
  assert.match(JSON.stringify(field), /"slice"/);
  assert.match(JSON.stringify(field), /"index-of","\/"/);
});

// 554 Mapy labels a contour with its bare height in bold
test("a contour label is the bare height in bold", () => {
  const withContours = buildStyle({
    theme: "svetla", mapType: "turisticka", tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf", contoursUrl: "https://x/contours.pmtiles", overrides
  });
  const label = withContours.layers.find((l) => l.id === "contour-label").layout;
  assert.doesNotMatch(JSON.stringify(label["text-field"]), / m"/);
  assert.deepEqual(label["text-font"], ["Noto Sans Bold"]);
});

// 554 Mapy draws a wall as a thin grey line with ticks along it, ours was a thick brown line
test("a wall is a grey line with ticks", () => {
  assert.equal(byId("feature-wall").paint["line-color"], "#8f8f8f");
  assert.ok(byId("feature-wall-teeth"), "the ticks");
  assert.ok(byId("feature-wall-teeth").paint["line-dasharray"], "spaced ticks");
});
