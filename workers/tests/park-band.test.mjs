import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyle, normalizeOverrides, THEMES, PARK_BAND, PARK_BAND_MIN_Z, PARK_RESERVE_MIN_Z,
  PARK_RESERVE_TICKS
} from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

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

// 564 a 7 px band from the clipped polygon was all the 8 px tile buffer allowed; Mapy's is 22 px
test("a landscape area's band is Mapy's 22 px wide, inside the border line, from z12", () => {
  const band = byId("park");
  assert.equal(band["source-layer"], "park_border");
  assert.equal(band.minzoom, PARK_BAND_MIN_Z);
  assert.equal(PARK_BAND_MIN_Z, 12, "Mapy's z13");
  const widths = stops(band.paint["line-width"]);
  assert.deepEqual(stops(band.paint["line-offset"]), widths.map((w) => w / 2), "inward from the border");
  assert.ok(Math.max(...widths) >= 20, "as wide as Mapy's");
  assert.equal(band.paint["line-opacity"], undefined, "a translucent line darkens at its joins");
  assert.equal(band.paint["line-blur"], undefined, "Mapy's band has crisp edges");
  assert.equal(band.layout["line-join"], "round", "no spikes at the corners");
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
  assert.ok(Math.max(...stops(line.paint["line-width"])) <= 5, "thin");
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

// 564 Mapy's band over open land is a pale #a9c487; ours was overridden darker by zoom
test("by day the band is Mapy's pale green at every zoom, the night keeps its own", () => {
  assert.equal(byId("park").paint["line-color"], "#a9c787");
  assert.notEqual(build("tmava").layers.find((l) => l.id === "park").paint["line-color"], "#a9c787");
  assert.equal(THEMES.svetla.park, "#a9c787");
});
