// 508 a region held only as package cuts reads each base layer from its package's cut
import test from "node:test";
import assert from "node:assert/strict";
import { regionStyle } from "../../poc/web/region-style.js";

const cuts = Object.fromEntries(
  ["landscape", "paths", "roads", "water", "railways", "settlements", "points", "boundaries"]
    .map((p) => [p, `tiles/r-omt-${p}.pmtiles`])
);
const make = (region) => regionStyle({
  manifest: { regions: { r: region } }, regionKey: "r", baseUrl: "http://x",
  set: null, overrides: {}, theme: "svetla", mapType: undefined, languages: []
});

test("base layers read the cuts and no whole base source is left", () => {
  const style = make({ name: "R", cuts });
  assert.equal(style.sources.omt, undefined);
  const used = new Set(style.layers.map((l) => l.source).filter((s) => s?.startsWith("omt-")));
  assert.ok(used.size > 1);
  for (const id of used) {
    assert.equal(style.sources[id].url, `pmtiles://http://x/tiles/r-omt-${id.slice(4)}.pmtiles`);
  }
});

test("a region with its whole base map keeps one source", () => {
  const style = make({ name: "R", pmtiles: "tiles/r.pmtiles", cuts });
  assert.equal(style.sources.omt.url, "pmtiles://http://x/tiles/r.pmtiles");
});
