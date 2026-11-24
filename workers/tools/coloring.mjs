#!/usr/bin/env node
/**
 * The coloring tool for an agent: our tile and the reference as PNGs plus a report, edits kept in a file.
 *
 *   node workers/tools/coloring.mjs tile 16/35886/22711   show a tile (also: next, show)
 *   node workers/tools/coloring.mjs set --layer=water --prop=fill-color --color=#a4c8e8 [--zoom=15]
 *   node workers/tools/coloring.mjs set --palette=water --color=#a4c8e8
 *   node workers/tools/coloring.mjs clear --layer=water --prop=fill-color [--zoom=15]
 *   node workers/tools/coloring.mjs done                    mark the shown tile as matching
 *   node workers/tools/coloring.mjs save                    edits into poc/web/style-overrides.json
 *   node workers/tools/coloring.mjs compare 48.462,17.260 14 [--size=3]   a block of tiles, side by side
 *
 * COLORING_SITE is the deployed viewer (tiles/manifest.json under it), MAPY_API_KEY the reference key.
 * Flags: --theme=tmava draws our side in the dark theme, --tiles=<dir> serves the region's .pmtiles from a local build, --state=<edits json> (default coloring/edits.json), --out=<dir> (default coloring/), --region=<key>.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyEdits, setColor, clearColor, styleZoomOf, tileKey, nextTile, blockAround, byteRange } from "../../poc/web/coloring-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(ROOT, "poc", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

const [command, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith("--"));
const args = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => {
  const [k, ...v] = a.slice(2).split("=");
  return [k, v.join("=") || "true"];
}));
const OUT = args.out || join(ROOT, "coloring");
const STATE = args.state || join(OUT, "edits.json");

function fail(message) {
  console.error(message);
  process.exit(2);
}

function readState() {
  if (!existsSync(STATE)) return emptyEdits();
  return { ...emptyEdits(), ...JSON.parse(readFileSync(STATE, "utf8")) };
}

function writeState(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
}

function parseTile(text) {
  const [z, x, y] = String(text || "").split("/").map(Number);
  if (![z, x, y].every(Number.isInteger)) fail(`a tile is z/x/y, not "${text}"`);
  return { z, x, y };
}

function edit(state) {
  if (args.palette) return { palette: args.palette, color: args.color };
  const zoom = args.zoom != null ? Number(args.zoom) : state.tile ? styleZoomOf(state.tile.z) : null;
  return { layer: args.layer, prop: args.prop, zoom, color: args.color };
}

const archives = new Map();

/** A byte range of a local archive, as Pages serves the deployed one. */
function fulfillRange(route, file) {
  if (!archives.has(file)) archives.set(file, readFileSync(file));
  const body = archives.get(file);
  const range = byteRange(route.request().headers().range, body.length);
  if (!range) return route.fulfill({ body, contentType: "application/octet-stream" });
  const [start, end] = range;
  return route.fulfill({
    status: 206,
    body: body.subarray(start, end + 1),
    headers: {
      "content-type": "application/octet-stream",
      "content-range": `bytes ${start}-${end}/${body.length}`,
      "accept-ranges": "bytes"
    }
  });
}

/** The page on the site's own origin, its files from this checkout: Pages answers no CORS preflight. */
async function openPage(state) {
  const site = (process.env.COLORING_SITE || args.site || "").replace(/\/$/, "");
  if (!site) fail("COLORING_SITE is the deployed viewer, e.g. https://<user>.github.io/<repo>");
  const require = createRequire(join(ROOT, "noop.js"));
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    fail("playwright is needed: npm i -g playwright");
  }
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const browser = await chromium.launch({
    proxy, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  await page.route(`${site}/*`, (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const file = join(WEB, name);
    if (TYPES[extname(name)] && (extname(name) !== ".json" || name === "style-overrides.json") && existsSync(file)) {
      return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(name)] });
    }
    return route.continue();
  });
  if (args.tiles) {
    await page.route(`${site}/tiles/*.pmtiles`, (route) => {
      const file = join(args.tiles, new URL(route.request().url()).pathname.split("/").pop());
      return existsSync(file) ? fulfillRange(route, file) : route.continue();
    });
  }
  await page.addInitScript((key) => {
    localStorage.setItem("fricomaps.coloring.key", key);
  }, process.env.MAPY_API_KEY || "");
  const query = new URLSearchParams();
  if (args.region) query.set("region", args.region);
  if (args.theme) query.set("theme", args.theme);
  await page.goto(`${site}/coloring.html${query.size ? `?${query}` : ""}`);
  await page.waitForFunction(() => window.coloring?.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.coloring.ready);
  await page.evaluate((e) => window.coloring.loadEdits(e), state);
  return { browser, page, errors };
}

async function show(tile) {
  const state = readState();
  const { browser, page, errors } = await openPage(state);
  try {
    if (!tile) {
      const region = await page.evaluate(() => window.coloring.region());
      tile = nextTile(state.tile, region.bbox);
      if (!tile) fail(`${tileKey(state.tile)} was the region's last tile at z${state.tile.z}`);
    }
    const report = await page.evaluate((t) => window.coloring.goto(t.z, t.x, t.y), tile);
    const images = await page.evaluate(() => window.coloring.images());
    const base = join(OUT, tileKey(tile).replaceAll("/", "-"));
    mkdirSync(OUT, { recursive: true });
    for (const side of ["ours", "ref"]) {
      writeFileSync(`${base}-${side}.png`, Buffer.from(images[side].split(",")[1], "base64"));
    }
    writeFileSync(`${base}-report.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeState({ ...state, tile });
    console.log(JSON.stringify({
      tile: tileKey(tile), styleZoom: report.styleZoom, matches: report.matches,
      images: [`${base}-ours.png`, `${base}-ref.png`], report: `${base}-report.json`,
      differ: report.items.filter((i) => i.share >= 0.01 && i.delta >= 10)
        .map(({ layer, prop, color, ours, ref, delta, share, paletteKey }) =>
          ({ layer, prop, color, ours, ref, delta, share, paletteKey })),
      errors
    }, null, 1));
  } finally {
    await browser.close();
  }
}

/** A size × size block of reference tiles around a place: ours left, the reference right, and what is drawn. */
async function compare(place, z) {
  const [lat, lon] = String(place || "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(z)) {
    fail("compare <lat>,<lon> <reference zoom>");
  }
  const size = Number(args.size || 3);
  const block = blockAround(lon, lat, z, size);
  const { browser, page, errors } = await openPage(readState());
  const drawn = new Map();
  try {
    const parts = [];
    for (const t of block) {
      const report = await page.evaluate((at) => window.coloring.goto(at.z, at.x, at.y), t);
      parts.push({ i: t.i, j: t.j, ...(await page.evaluate(() => window.coloring.images())) });
      for (const item of [...report.items, ...report.symbols]) {
        const seen = drawn.get(item.layer) || { layer: item.layer, share: 0, classes: new Set() };
        seen.share += item.share / block.length;
        for (const c of item.classes || []) seen.classes.add(c);
        drawn.set(item.layer, seen);
      }
    }
    const png = await page.evaluate(async ({ parts, size }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size * 512 * 2 + 16;
      canvas.height = size * 512;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const load = (src) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = src; });
      for (const p of parts) {
        ctx.drawImage(await load(p.ours), p.i * 512, p.j * 512);
        ctx.drawImage(await load(p.ref), size * 512 + 16 + p.i * 512, p.j * 512);
      }
      return canvas.toDataURL("image/png");
    }, { parts, size });
    mkdirSync(OUT, { recursive: true });
    const base = join(OUT, `compare-${z}-${lat}-${lon}`);
    writeFileSync(`${base}.png`, Buffer.from(png.split(",")[1], "base64"));
    const layers = [...drawn.values()].sort((a, b) => b.share - a.share)
      .map((d) => ({ layer: d.layer, share: Math.round(d.share * 1000) / 1000, classes: [...d.classes] }));
    console.log(JSON.stringify({ image: `${base}.png`, styleZoom: styleZoomOf(z), tiles: `${tileKey(block[0])} +${size}`, layers, errors }, null, 1));
  } finally {
    await browser.close();
  }
}

async function save() {
  const state = readState();
  const { browser, page } = await openPage(state);
  let result;
  try {
    result = await page.evaluate(() => window.coloring.overrides());
  } finally {
    await browser.close();
  }
  const file = join(OUT, "overrides.json");
  writeFileSync(file, JSON.stringify(result.overrides, null, 2));
  execFileSync("node", [join(ROOT, "workers", "styles", "overrides.mjs"), `--file=${file}`], { stdio: "inherit" });
  for (const u of result.unkept) console.log(`the dark theme follows the light colour: ${u}`);
  writeState({ ...emptyEdits(), done: state.done, tile: state.tile });
}

switch (command) {
  case "tile":
    await show(parseTile(positional[0]));
    break;
  case "show": {
    const { tile } = readState();
    if (!tile) fail("no tile shown yet: tile z/x/y");
    await show(tile);
    break;
  }
  case "next": {
    const state = readState();
    if (!state.tile) fail("no tile shown yet: tile z/x/y");
    await show(null);
    break;
  }
  case "set":
  case "clear": {
    const state = readState();
    const change = command === "set" ? setColor : clearColor;
    writeState({ ...state, ...change(state, edit(state)) });
    console.log(JSON.stringify(readState(), null, 1));
    break;
  }
  case "done": {
    const state = readState();
    if (!state.tile) fail("no tile shown yet");
    if (!state.done.includes(tileKey(state.tile))) state.done.push(tileKey(state.tile));
    writeState(state);
    break;
  }
  case "compare":
    await compare(positional[0], Number(positional[1]));
    break;
  case "save":
    await save();
    break;
  default:
    fail("commands: tile z/x/y, show, next, set, clear, done, save, compare (see the file header)");
}
