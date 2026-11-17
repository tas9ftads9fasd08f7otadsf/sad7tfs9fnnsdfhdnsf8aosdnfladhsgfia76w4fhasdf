import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle, PARK_BAND } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

const style = buildStyle({
  theme: "svetla",
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  trailsUrl: "https://x/trails.pmtiles"
});
const byId = (id) => style.layers.find((l) => l.id === id);

// 544 Mapy's band is solid and 9–10 px wide, just inside the border
test("a protected area is a solid border with a band inside it, not a fill over the land", () => {
  const ticks = byId("park");
  assert.equal(ticks.type, "line");
  assert.equal(style.layers.some((l) => l["source-layer"] === "park" && l.type === "fill"), false);
  const widths = ticks.paint["line-width"].slice(3).filter((_, i) => i % 2 === 1);
  const offsets = ticks.paint["line-offset"].slice(3).filter((_, i) => i % 2 === 1);
  assert.deepEqual(offsets, widths.map((w) => w / 2), "the band starts at the border, inward");
  assert.equal(ticks.paint["line-dasharray"], undefined, "a band, not ticks");
  assert.equal(ticks.paint["line-opacity"], undefined, "overlaps in a translucent line would darken");
  assert.equal(ticks.layout["line-join"], "round", "no spikes at the corners");
  assert.ok(Math.max(...widths) >= 7, "wide enough to read as a band");
  assert.equal(byId("park-outline").paint["line-dasharray"], undefined, "the border is solid");
});

test("the band stays within the 8 px tile buffer, so tile seams inside a park don't show", () => {
  for (const [, width] of PARK_BAND) assert.ok(width <= 8, `${width} px`);
});

test("Natura 2000 sites and buffer zones get no border, reserves and parks do", { skip: !spec && NEEDS_SPEC }, () => {
  const shown = (id, cls, type = "Polygon") => {
    const parsed = spec.expression.createExpression(byId(id).filter);
    assert.equal(parsed.result, "success");
    return parsed.value.evaluate({ zoom: 14 }, { type, properties: { class: cls } });
  };
  for (const id of ["park", "park-outline"]) {
    for (const cls of ["prírodná_rezervácia", "national_park", "národná_prírodná_rezervácia"]) {
      assert.equal(shown(id, cls), true, `${id} ${cls}`);
      assert.equal(shown(id, cls, "MultiPolygon"), true, `${id} ${cls} multipolygon`);
    }
    for (const cls of ["protected_area", "ochranné_pásmo_prírodnej_rezervácie", "na_bani_(external)"]) {
      assert.equal(shown(id, cls), false, `${id} ${cls}`);
    }
    assert.equal(shown(id, "prírodná_rezervácia", "Point"), false, `${id} label point`);
  }
});
