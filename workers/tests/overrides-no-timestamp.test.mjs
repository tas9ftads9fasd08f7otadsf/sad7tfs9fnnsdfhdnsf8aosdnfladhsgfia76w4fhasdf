import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serializeOverrides } from "../../poc/web/devmode.js";

test("saved overrides carry no save time, which made every two branches conflict", () => {
  const saved = JSON.parse(serializeOverrides({ version: 2, updated_at: "2026-01-01T00:00:00Z", hillshade: true }));
  assert.deepEqual(saved, { version: 2, hillshade: true });
  const file = JSON.parse(readFileSync(new URL("../../poc/web/style-overrides.json", import.meta.url)));
  assert.equal("updated_at" in file, false);
});
