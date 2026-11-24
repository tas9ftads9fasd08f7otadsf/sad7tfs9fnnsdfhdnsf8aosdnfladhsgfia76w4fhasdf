import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, normalizeOverrides, THEMES, PARK_BAND, PARK_BAND_FADE, PARK_BAND_MIN_Z, PARK_RESERVE_MIN_Z,
  PARK_RESERVE_TICKS
} from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";
import { valueAtZoom } from "../../poc/web/layer-style.js";

const spec = styleSpec();

const build = (theme = "svetla") => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles",
  overrides: normalizeOverrides(JSON.parse(readFileSync(
    new URL("../../poc/web/style-overrides.json", import.meta.url)))).overrides
});
const style = build();
const byId = (id) => style.layers.find((l) => l.id === id);
const stops = (expr) => expr.slice(3).filter((_, i) => i % 2 === 1);

// 564 a 7 px band from the clipped polygon was all the 8 px tile buffer allowed; Mapy's is 18–22 px
test("a landscape area has Mapy's two bands inside the border line from z12: strong, then pale", () => {
  const band = byId("park");
  const fade = byId("park-fade");
  for (const l of [band, fade]) {
    assert.equal(l["source-layer"], "park_border");
    assert.equal(l.minzoom, PARK_BAND_MIN_Z);
    // 574 owner: opaque, the band hid the land and was huge from afar, worst at night
    assert.ok(valueAtZoom(l.paint["line-opacity"], 13) <= 0.65, "the land shows through");
    assert.ok(valueAtZoom(l.paint["line-blur"], 12) >= valueAtZoom(l.paint["line-blur"], 16), "soft far out");
    assert.equal(l.layout["line-join"], "round", "no spikes at the corners");
  }
  assert.equal(PARK_BAND_MIN_Z, 12, "Mapy's z13");
  const widths = stops(band.paint["line-width"]);
  assert.deepEqual(stops(band.paint["line-offset"]), widths.map((w) => w / 2), "inward from the border");
  assert.deepEqual(stops(fade.paint["line-offset"]), PARK_BAND_FADE.map(([, w], i) => PARK_BAND[i][1] + w / 2),
    "the pale band starts where the strong one ends");
  const total = (i) => PARK_BAND[i][1] + PARK_BAND_FADE[i][1];
  assert.ok(total(1) >= 16 && total(1) <= 18, `Mapy's z15 band is about 18 px, ours ${total(1)}`);
  // 574 Mapy's band narrows close up: about 12 px at its z17.5
  assert.ok(total(PARK_BAND.length - 1) <= 13, `close up ${total(PARK_BAND.length - 1)} px`);
  assert.ok(style.layers.indexOf(fade) < style.layers.indexOf(band));
});

// 564 the cut edges of a clipped polygon drew stripes along tile seams inside a park
test("no protected-area line is drawn from the clipped polygon", () => {
  const lines = style.layers.filter((l) => l["source-layer"] === "park" && l.type === "line");
  assert.deepEqual(lines.map((l) => l.id), []);
});

// 564 reserves were the same thick band as a landscape area; Mapy draws them as a ticked line
test("a reserve is a thin line with ticks pointing inside, from z13", () => {
  const line = byId("park-outline");
  const ticks = byId("park-outline-teeth");
  for (const l of [line, ticks]) {
    assert.equal(l["source-layer"], "park_border");
    assert.equal(l.minzoom, PARK_RESERVE_MIN_Z);
  }
  assert.equal(PARK_RESERVE_MIN_Z, 13, "Mapy's z14");
  assert.ok(Math.max(...stops(line.paint["line-width"])) <= 3.5, "Mapy's 3 px at 2× by z14");
  assert.ok(ticks.paint["line-dasharray"], "ticks, not a band");
  assert.deepEqual(stops(ticks.paint["line-offset"]), PARK_RESERVE_TICKS.map(([, w]) => w / 2),
    "they start at the line and point inside");
});

test("Natura 2000 sites and buffer zones get no border; parks a band, reserves a line",
  { skip: !spec && NEEDS_SPEC }, () => {
    const shown = (id, cls) => {
      const parsed = spec.expression.createExpression(byId(id).filter);
      assert.equal(parsed.result, "success");
      return parsed.value.evaluate({ zoom: 14 }, { type: "LineString", properties: { class: cls } });
    };
    for (const cls of ["chránená_krajinná_oblasť", "national_park", "národný_park", "chráněná_krajinná_oblast"]) {
      assert.equal(shown("park", cls), true, `band ${cls}`);
      assert.equal(shown("park-fade", cls), true, `pale band ${cls}`);
      assert.equal(shown("park-outline", cls), false, `no line ${cls}`);
    }
    for (const cls of ["prírodná_rezervácia", "národná_prírodná_rezervácia", "chránený_areál"]) {
      assert.equal(shown("park", cls), false, `no band ${cls}`);
      assert.equal(shown("park-outline", cls), true, `line ${cls}`);
    }
    for (const id of ["park", "park-outline"]) {
      for (const cls of ["protected_area", "ochranné_pásmo_národného_parku", "na_bani_(external)"]) {
        assert.equal(shown(id, cls), false, `${id} ${cls}`);
      }
    }
  });

// 564 Mapy's band over open land is #9ab972–#a0be7c, the pale one #b6d196–#ccd8b4
// 574 translucent now: a darker colour at 55 % gives the same green over a meadow
test("by day the bands are Mapy's greens at every zoom, the night keeps its own", () => {
  assert.equal(byId("park").paint["line-color"], "#7fa35a");
  assert.equal(byId("park-fade").paint["line-color"], "#c9d6b1");
  assert.notEqual(build("tmava").layers.find((l) => l.id === "park").paint["line-color"], "#7fa35a");
  assert.equal(THEMES.svetla.park, "#7fa35a");
});
