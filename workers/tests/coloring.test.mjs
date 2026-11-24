import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tileBounds, tileAt, tileCenter, nextTile, styleZoomOf, providerUrl, colorHex, deltaE,
  summarize, tileMatches, emptyEdits, setColor, clearColor, zoomValue, applyEdits, darkColorsOf,
  blockAround, byteRange, settled
} from "../../poc/web/coloring-core.js";
import { emptyOverrides, normalizeOverrides, buildStyle } from "../../poc/web/themes.js";

test("a tile's centre lies in that tile", () => {
  const [lon, lat] = tileCenter(16, 35886, 22711);
  assert.deepEqual(tileAt(lon, lat, 16), { z: 16, x: 35886, y: 22711 });
  const [w, s, e, n] = tileBounds(16, 35886, 22711);
  assert.ok(w < lon && lon < e && s < lat && lat < n);
});

test("a 256 px reference tile matches the style one zoom lower", () => {
  assert.equal(styleZoomOf(16), 15);
});

test("the next tile walks the bbox row by row and ends", () => {
  const bbox = [17.1, 48.1, 17.12, 48.12];
  const first = tileAt(bbox[0], bbox[3], 16);
  let t = first;
  let n = 1;
  while ((t = nextTile(t, bbox))) n += 1;
  const last = tileAt(bbox[2], bbox[1], 16);
  assert.equal(n, (last.x - first.x + 1) * (last.y - first.y + 1));
});

test("the provider key goes in the url, not in the code", () => {
  const url = providerUrl("mapy-outdoor", "k", { z: 1, x: 2, y: 3 });
  assert.match(url, /\/256@2x\/1\/2\/3\?.*apikey=k/);
});

test("evaluated colours become hex, premultiplied ones unpremultiplied", () => {
  assert.equal(colorHex({ r: 0.5, g: 0, b: 0, a: 0.5 }), "#ff0000");
  assert.equal(colorHex("rgba(0, 128, 255, 1)"), "#0080ff");
  assert.equal(colorHex("#abc"), "#aabbcc");
  assert.ok(deltaE("#ffffff", "#fefefe") < 1);
});

test("samples group per layer and colour, the reference decides the match", () => {
  const meta = { "frico:palette": { "fill-color": "wood" } };
  const s = (ours, ref) => ({ layer: "wood", type: "fill", meta, color: "#aaccaa", ours, ref, at: [0, 0] });
  const items = summarize([s([170, 204, 170], [170, 204, 170]), s([170, 204, 170], [90, 160, 90])]);
  assert.equal(items.length, 1);
  assert.equal(items[0].paletteKey, "wood");
  assert.equal(items[0].share, 1);
  const same = summarize([s([1, 2, 3], [1, 2, 3])]);
  assert.ok(tileMatches(same));
  assert.ok(!tileMatches(summarize([s([255, 255, 255], [0, 0, 0])])));
});

test("colours per zoom become contiguous bands the overrides accept", () => {
  assert.equal(zoomValue({ 14: "#111111" }), "#111111");
  assert.deepEqual(zoomValue({ 15: "#222222", 12: "#111111", 13: "#111111" }),
    [[0, 14, "#111111"], [15, 20, "#222222"]]);
});

test("edits land on the default map, the dark theme keeps its colour", () => {
  let edits = setColor(emptyEdits(), { layer: "water", prop: "fill-color", zoom: 12, color: "#0000ff" });
  edits = setColor(edits, { layer: "water", prop: "fill-color", zoom: 15, color: "#0000aa" });
  edits = setColor(edits, { palette: "water", color: "#00ff00" });
  const out = applyEdits(emptyOverrides(), edits, { darkColors: { water: { "fill-color": "#101030" } } });
  const { overrides, problems } = normalizeOverrides(out);
  assert.deepEqual(problems, []);
  const water = overrides.maps.turisticka.layers.water;
  assert.deepEqual(water.paint["fill-color"], [[0, 14, "#0000ff"], [15, 20, "#0000aa"]]);
  assert.equal(water.paintDark["fill-color"], "#101030");
  assert.equal(overrides.palette.svetla.water, "#00ff00");
  assert.deepEqual(clearColor(clearColor(edits, { layer: "water", prop: "fill-color" }),
    { palette: "water" }).layers, {});
});

test("the dark colours to keep come from the dark style", () => {
  const style = buildStyle({ theme: "tmava", tilesUrl: "https://x/t.pmtiles", spriteUrl: "s", glyphsUrl: "g" });
  const layer = style.layers.find((l) => l.type === "fill" && typeof l.paint?.["fill-color"] === "string");
  const edits = setColor(emptyEdits(), { layer: layer.id, prop: "fill-color", zoom: 10, color: "#123456" });
  const { colors, unkept } = darkColorsOf(style, edits);
  assert.equal(colors[layer.id]["fill-color"], colorHex(layer.paint["fill-color"]));
  assert.deepEqual(unkept, []);
});

// 565 a compare block is centred on the place it was asked for
test("a block of tiles is centred on its place, row by row", () => {
  const block = blockAround(17.26048, 48.46239, 14, 3);
  assert.equal(block.length, 9);
  assert.deepEqual(block[4], { z: 14, x: 8977, y: 5663, i: 1, j: 1 });
  assert.deepEqual(block.map((t) => [t.i, t.j]).slice(0, 4), [[0, 0], [1, 0], [2, 0], [0, 1]]);
});

// 565 a local archive answers range requests as Pages does, or the viewer can't read it
test("a byte range is cut within the file", () => {
  assert.deepEqual(byteRange("bytes=0-16383", 100000), [0, 16383]);
  assert.deepEqual(byteRange("bytes=99000-", 100000), [99000, 99999]);
  assert.deepEqual(byteRange("bytes=90000-200000", 100000), [90000, 99999]);
  assert.equal(byteRange(undefined, 100000), null);
});

// 565 bug: a tile past the region's edge left the probe never idle and `compare` hung for good
test("a map that never goes idle still lets the tile be read", async () => {
  const stuck = { once: () => {}, triggerRepaint: () => {} };
  assert.equal(await Promise.race([settled(stuck, 20).then(() => "read"),
    new Promise((r) => setTimeout(() => r("hung"), 500))]), "read");
  let done;
  const quick = { once: (_, f) => { done = f; }, triggerRepaint: () => done() };
  assert.equal(await Promise.race([settled(quick, 10000).then(() => "read"),
    new Promise((r) => setTimeout(() => r("hung"), 500))]), "read");
});
