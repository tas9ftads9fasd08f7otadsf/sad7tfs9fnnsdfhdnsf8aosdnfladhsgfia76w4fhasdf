import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStyle } from "../../poc/web/themes.js";
import { styleSpec, NEEDS_SPEC } from "./spec.mjs";

const spec = styleSpec();

// 448 `station` is meant for lift stations; Kežmarok's railway station got a ski icon
test("a railway station isn't a ski point, a lift station is", { skip: !spec && NEEDS_SPEC }, () => {
  const style = buildStyle({
    theme: "svetla",
    mapType: "lyziarska",
    tilesUrl: "https://x/tiles.pmtiles",
    spriteUrl: "https://x/sprite",
    glyphsUrl: "https://x/fonts/{fontstack}/{range}.pbf"
  });
  const filter = spec.featureFilter(style.layers.find((l) => l.id === "poi-ski").filter);
  const shown = (properties) => filter.filter({ zoom: 15 }, { type: 1, properties });
  assert.equal(shown({ class: "railway", subclass: "station", rank: 1 }), false);
  assert.equal(shown({ class: "aerialway", subclass: "station", rank: 1 }), true);
  assert.equal(shown({ class: "ski", subclass: "ski_rental", rank: 1 }), true);
});
