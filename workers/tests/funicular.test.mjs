import { test } from "node:test";
import assert from "node:assert/strict";
import { railLayers } from "../../poc/web/packages.js";
import { LIFT_DASH } from "../../poc/web/lifts.js";

// 525 Mapy draws a funicular (Hrebienok) as a cable car, cabins on a band; ours was a thin urban line
test("a funicular wears a cable car's band and cabins, not the urban line", () => {
  for (const dark of [false, true]) {
    const { ground } = railLayers(dark);
    const byId = (id) => ground.find((l) => l.id === id);
    assert.ok(!JSON.stringify(byId("pkg-rail-urban").filter).includes("funicular"));
    const band = byId("pkg-rail-funicular-casing");
    const cabins = byId("pkg-rail-funicular");
    assert.ok(band && cabins, "band and cabins");
    assert.deepEqual(cabins.paint["line-dasharray"], LIFT_DASH.cabin);
    assert.ok(ground.indexOf(band) < ground.indexOf(cabins), "the cabins ride on the band");
    const cable = byId("pkg-rail-lift-cabin");
    assert.deepEqual(cabins.paint["line-color"], cable.paint["line-color"]);
  }
});
