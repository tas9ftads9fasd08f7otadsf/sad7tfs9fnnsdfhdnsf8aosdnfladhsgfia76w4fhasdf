import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, EARLY_STREETS, buildStyle, valueAtZoom } from "../../poc/web/themes.js";
import { packageOf } from "../../poc/web/packages.js";

const urls = { tilesUrl: "https://x/tiles.pmtiles", spriteUrl: "https://x/sprite",
  glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf" };
const withTransport = (theme) =>
  buildStyle({ theme, ...urls, transportUrl: "pmtiles://https://x/transport.pmtiles" });

// 557 Riki Maps TestFlight ABr8: at z11.9 a town showed no small streets, the base has none below z12
test("below z12 a town's small streets are drawn from the transport package", () => {
  for (const theme of Object.keys(THEMES)) {
    const style = withTransport(theme);
    const at = (id) => style.layers.findIndex((l) => l.id === id);
    const early = style.layers[at("road-minor-early")];
    assert.ok(early, `${theme} draws road-minor-early`);
    assert.equal(early.source, "transport");
    assert.equal(packageOf(early), "roads");
    assert.equal(early.minzoom, 11);
    assert.equal(early.maxzoom, 12);
    for (const kind of ["residential", "living_street", "unclassified"]) {
      assert.ok(EARLY_STREETS.classes.includes(kind), `${kind} is a small street`);
    }
    assert.ok(valueAtZoom(early.paint["line-width"], 11.9) >= 0.5, `${theme} draws it visibly`);
    assert.ok(at("road-minor-early") < at("road-minor-casing"), `${theme} draws it under roads`);
  }
});

// 557 without the transport package the style has no source to draw them from
test("a style without the transport package has no early streets", () => {
  const style = buildStyle({ theme: Object.keys(THEMES)[0], ...urls });
  assert.equal(style.layers.find((l) => l.id === "road-minor-early"), undefined);
});
