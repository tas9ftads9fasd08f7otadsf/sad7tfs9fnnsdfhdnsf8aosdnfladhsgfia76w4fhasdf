import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStyle, normalizeOverrides, THEMES, CLOSED_SERVICE_MIN_Z } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const saved = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
const spec = styleSpec();
const layersOf = (theme) => buildStyle({
  theme,
  mapType: "turisticka",
  tilesUrl: "https://x/tiles.pmtiles",
  spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf",
  overrides: normalizeOverrides(saved).overrides
}).layers;
const light = layersOf("svetla");
const drawnBy = (props, zoom = 15) => light.filter((l) => l["source-layer"] === "transportation" && l.type === "line"
  && (!l.filter || spec.featureFilter(l.filter).filter({ zoom }, { type: "LineString", properties: props })))
  .map((l) => l.id);
const index = (id) => light.findIndex((l) => l.id === id);

// 543 Mapy draws a service road closed to the public pale blue-grey (#ececf1, border #b8b6af), a parking aisle white
test("a closed service road is drawn pale blue-grey with a grey border", { skip: !spec && NEEDS_SPEC }, () => {
  for (const access of ["no", "private"]) {
    const ids = drawnBy({ class: "service", access });
    assert.ok(ids.includes("road-service-closed-casing"), access);
    assert.ok(ids.includes("road-service-closed"), access);
  }
  const fill = light.find((l) => l.id === "road-service-closed");
  assert.equal(fill.paint["line-color"], "#ececf1");
  assert.equal(light.find((l) => l.id === "road-service-closed-casing").paint["line-color"], "#b8b6af");
});

test("a parking aisle, a driveway and an open service road stay white", { skip: !spec && NEEDS_SPEC }, () => {
  for (const props of [{ class: "service" }, { class: "service", service: "parking_aisle" },
    { class: "service", service: "driveway" }, { class: "service", access: "customers" }, { class: "minor", access: "no" }]) {
    const ids = drawnBy(props);
    assert.ok(!ids.some((id) => id.startsWith("road-service-closed")), JSON.stringify(props));
  }
});

test("a closed service road lies over the open one and under the roads that cross it", () => {
  assert.ok(index("road-service-closed") > index("road-service"));
  assert.ok(index("road-service-closed") < index("road-minor"));
  assert.ok(index("road-service-closed-casing") > index("road-service-casing"));
  assert.ok(index("road-service-closed-casing") < index("road-service-closed"));
  assert.ok(light.find((l) => l.id === "road-service-closed").minzoom >= CLOSED_SERVICE_MIN_Z);
});

test("every theme has its own colours for the closed service road", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    assert.match(theme.serviceClosed, /^#[0-9a-f]{6}$/i, name);
    assert.match(theme.serviceClosedEdge, /^#[0-9a-f]{6}$/i, name);
  }
  assert.notEqual(THEMES.svetla.serviceClosed, THEMES.tmava.serviceClosed);
  assert.ok(layersOf("tmava").some((l) => l.id === "road-service-closed"));
});

test("a closed service road has the width of a service road", () => {
  const w = (id) => light.find((l) => l.id === id).paint["line-width"];
  assert.deepEqual(w("road-service-closed"), w("road-service"));
});
