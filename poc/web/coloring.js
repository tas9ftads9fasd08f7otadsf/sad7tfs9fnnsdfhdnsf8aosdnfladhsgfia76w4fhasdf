/** Our tile beside a provider's, the colours of everything on it, and edits an agent can drive. */
import {
  normalizeOverrides,
  hasOverrides,
  emptyOverrides,
  selectedIconSource,
  mergedPalette,
  DEFAULT_MAP_TYPE,
  MAX_DISPLAY_Z
} from "./themes.js";
import { loadOverrides, saveOverrides, serializeOverrides } from "./devmode.js";
import { labelLanguages } from "./languages.js";
import { parsePatternName, renderPattern } from "./patterns.js";
import { ROAD_SIGN_IMAGE, loadSheet, addSign } from "./road-signs.js";
import { ICON_SOURCES, DEFAULT_ICON_SOURCE } from "./icon-sources.js";
import { regionStyle } from "./region-style.js";
import {
  TILE_PX,
  PROVIDERS,
  providerUrl,
  styleZoomOf,
  tileBounds,
  tileCenter,
  tileAt,
  nextTile,
  tileKey,
  colorHex,
  colorPropOf,
  summarize,
  tileMatches,
  emptyEdits,
  setColor,
  clearColor,
  applyEdits,
  darkColorsOf
} from "./coloring-core.js";

const STORE = "fricomaps.coloring";
const KEY_STORE = "fricomaps.coloring.key";
// grid step in css px of the 256 px tile: 64 × 64 samples
const STEP = 4;

const params = new URLSearchParams(location.search);
const siteUrl = (params.get("site") || new URL(".", location.href).href).replace(/\/$/, "");
const languages = labelLanguages(navigator.languages || [navigator.language]);

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const $ = (id) => document.getElementById(id);

const state = (() => {
  try {
    return { edits: emptyEdits(), provider: "mapy-outdoor", ...JSON.parse(localStorage.getItem(STORE)) };
  } catch {
    return { edits: emptyEdits(), provider: "mapy-outdoor" };
  }
})();
let apiKey = params.get("key") || (() => {
  try {
    return localStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
})();

function remember() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* private mode – edits last until the tab closes */
  }
}

let manifest;
let regionKey;
let iconSet = null;
let baseOverrides = emptyOverrides();
let roadSigns = null;
let views;
let probe;
let tile = null;
let report = null;
let ourImage = null;
let refImage = null;

async function loadJson(url, optional = false) {
  const res = await fetch(url, { cache: "no-store" }).catch((e) => ({ ok: false, statusText: e.message }));
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`${url}: ${res.status || ""} ${res.statusText}`);
  }
  return res.json();
}

async function loadIconSet() {
  const declared = manifest.icon_sources?.length
    ? manifest.icon_sources
    : [{ id: DEFAULT_ICON_SOURCE, sprite: manifest.sprite || "sprites/osm-liberty" }];
  const want = selectedIconSource(baseOverrides);
  const entry = declared.find((e) => e.id === want) || declared[0];
  const url = /^https?:/.test(entry.sprite) ? entry.sprite : `${siteUrl}/${entry.sprite}`;
  const index = await loadJson(`${url}.json`, true);
  if (!index) return null;
  const meta = ICON_SOURCES.find((s) => s.id === entry.id) || {};
  return {
    ...meta,
    id: entry.id,
    spriteUrl: url,
    icons: Object.keys(index),
    sdf: Object.values(index).some((e) => e && e.sdf)
  };
}

const currentOverrides = (edits = state.edits) =>
  applyEdits(baseOverrides, edits, { darkColors: darkColors(edits).colors });

function styleWith(overrides, theme = "svetla") {
  return regionStyle({
    manifest, regionKey, baseUrl: siteUrl, set: iconSet, overrides, theme,
    mapType: DEFAULT_MAP_TYPE, languages
  });
}

function darkColors(edits) {
  if (!Object.keys(edits.layers || {}).length) return { colors: {}, unkept: [] };
  return darkColorsOf(styleWith(baseOverrides, "tmava"), edits);
}

function withImages(map) {
  map.on("styleimagemissing", (ev) => {
    if (map.hasImage(ev.id)) return;
    if (ROAD_SIGN_IMAGE.test(ev.id)) {
      addSign(map, roadSigns, ev.id);
      return;
    }
    const spec = parsePatternName(ev.id);
    if (spec) map.addImage(ev.id, renderPattern(spec, 2), { pixelRatio: 2 });
  });
  return map;
}

function refStyle() {
  return {
    version: 8,
    sources: {
      ref: {
        type: "raster",
        tiles: [providerUrl(state.provider, apiKey)],
        tileSize: 256,
        maxzoom: MAX_DISPLAY_Z,
        attribution: PROVIDERS[state.provider]?.label || ""
      }
    },
    layers: [{ id: "ref", type: "raster", source: "ref" }]
  };
}

const FRAME = "tile-frame";

function drawFrame(map) {
  if (!tile || !map.isStyleLoaded()) return;
  const [w, s, e, n] = tileBounds(tile.z, tile.x, tile.y);
  const data = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] }
  };
  if (map.getSource(FRAME)) {
    map.getSource(FRAME).setData(data);
    return;
  }
  map.addSource(FRAME, { type: "geojson", data });
  map.addLayer({
    id: FRAME, type: "line", source: FRAME,
    paint: { "line-color": "#e0218a", "line-width": 2, "line-dasharray": [3, 2] }
  });
}

function makeViews() {
  const ours = withImages(new maplibregl.Map({
    container: "ours", style: styleWith(currentOverrides()), maxZoom: MAX_DISPLAY_Z,
    bounds: manifest.regions[regionKey].bbox, attributionControl: { compact: true }
  }));
  const ref = new maplibregl.Map({
    container: "ref", style: refStyle(), maxZoom: MAX_DISPLAY_Z,
    bounds: manifest.regions[regionKey].bbox, attributionControl: { compact: true }
  });
  let syncing = false;
  const follow = (from, to) => from.on("move", () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: 0, pitch: 0 });
    syncing = false;
  });
  follow(ours, ref);
  follow(ref, ours);
  let timer;
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const c = ours.getCenter();
      const z = Math.min(MAX_DISPLAY_Z + 1, Math.max(2, Math.round(ours.getZoom()) + 1));
      const at = tileAt(c.lng, c.lat, z);
      if (!tile || tileKey(at) !== tileKey(tile)) analyze(at).catch(showError);
    }, 400);
  };
  ours.on("moveend", settle);
  for (const m of [ours, ref]) m.on("style.load", () => drawFrame(m));
  return { ours, ref };
}

function makeProbe() {
  return withImages(new maplibregl.Map({
    container: "probe",
    style: styleWith(currentOverrides()),
    interactive: false,
    pixelRatio: TILE_PX / 256,
    preserveDrawingBuffer: true,
    fadeDuration: 0,
    attributionControl: false,
    center: tileCenter(14, 8800, 5700),
    zoom: 13
  }));
}

const idle = (map) => new Promise((resolve) => {
  map.once("idle", resolve);
  map.triggerRepaint();
});

function pixels(source) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, TILE_PX, TILE_PX);
  return { canvas, data: ctx.getImageData(0, 0, TILE_PX, TILE_PX).data };
}

async function referenceTile(t) {
  if (PROVIDERS[state.provider]?.needsKey && !apiKey) {
    throw new Error("Chýba API kľúč poskytovateľa – zadaj ho hore.");
  }
  const res = await fetch(providerUrl(state.provider, apiKey, t));
  if (!res.ok) throw new Error(`referenčná dlaždica: HTTP ${res.status}`);
  return pixels(await createImageBitmap(await res.blob()));
}

const rgbAt = (data, x, y) => {
  const i = (y * TILE_PX + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

let running = 0;

/** Draws the tile on both sides, samples it and fills the table; resolves to the report. */
async function analyze(t = tile) {
  if (!t) throw new Error("no tile");
  const ticket = ++running;
  tile = { z: t.z, x: t.x, y: t.y };
  state.tile = tile;
  remember();
  location.hash = `tile=${tileKey(tile)}`;
  for (const m of [views.ours, views.ref]) drawFrame(m);
  $("tile").value = tileKey(tile);
  setStatus(`Kreslím dlaždicu ${tileKey(tile)}…`);

  const styleZoom = styleZoomOf(tile.z);
  probe.jumpTo({ center: tileCenter(tile.z, tile.x, tile.y), zoom: styleZoom });
  const [ref] = await Promise.all([referenceTile(tile), idle(probe)]);
  if (ticket !== running) return report;
  const ours = pixels(probe.getCanvas());

  const samples = [];
  const symbols = new Map();
  const paper = probe.getStyle().layers.find((l) => l.type === "background");
  for (let y = STEP / 2; y < 256; y += STEP) {
    for (let x = STEP / 2; x < 256; x += STEP) {
      const hits = probe.queryRenderedFeatures([x, y]);
      const top = hits.find((f) => f.layer.type !== "symbol");
      for (const f of hits.filter((h) => h.layer.type === "symbol")) {
        const s = symbols.get(f.layer.id) || { layer: f.layer.id, count: 0, classes: new Set(), color: null };
        s.count += 1;
        s.color ||= colorHex(f.layer.paint?.["text-color"]) || colorHex(f.layer.paint?.["icon-color"]);
        if (f.properties.class) s.classes.add(f.properties.class);
        symbols.set(f.layer.id, s);
      }
      const px = [x * 2, y * 2];
      const layer = top ? probe.getLayer(top.layer.id) : null;
      const prop = top ? colorPropOf(top.layer.type) : "background-color";
      samples.push({
        layer: top?.layer.id || paper?.id || null,
        type: top?.layer.type || "background",
        meta: top ? layer?.metadata : paper?.metadata,
        color: top ? colorHex(top.layer.paint?.[prop]) : colorHex(paper?.paint?.[prop]),
        props: top?.properties || {},
        ours: rgbAt(ours.data, ...px),
        ref: rgbAt(ref.data, ...px),
        at: px
      });
    }
  }
  if (ticket !== running) return report;
  ourImage = ours.canvas;
  refImage = ref.canvas;
  const items = summarize(samples, { palette: mergedPalette("svetla", currentOverrides()) });
  for (const item of items) {
    const byZoom = state.edits.layers[item.layer]?.[item.prop] || {};
    item.edited = byZoom[styleZoom] || null;
  }
  report = {
    tile,
    styleZoom,
    provider: state.provider,
    matches: tileMatches(items),
    done: state.edits.done.includes(tileKey(tile)),
    items,
    symbols: [...symbols.values()].sort((a, b) => b.count - a.count).map((s) => ({
      layer: s.layer, color: s.color, classes: [...s.classes].slice(0, 4),
      share: Math.round((s.count / samples.length) * 1000) / 1000
    }))
  };
  render();
  setStatus(report.matches
    ? `Dlaždica ${tileKey(tile)} sedí – môžeš ísť ďalej.`
    : `Dlaždica ${tileKey(tile)}: ${items.filter((i) => i.delta >= 10 && i.share >= 0.01).length} farieb sa líši.`);
  return report;
}

function restyle() {
  const style = styleWith(currentOverrides());
  views.ours.setStyle(style);
  probe.setStyle(style);
}

function swatch(hex, title) {
  const s = document.createElement("span");
  s.className = "sw";
  if (hex) s.style.background = hex;
  else s.classList.add("none");
  s.title = `${title}: ${hex || "–"}`;
  return s;
}

function render() {
  const body = $("items");
  body.replaceChildren();
  for (const item of report.items) {
    const tr = document.createElement("tr");
    if (item.delta != null && item.delta >= 10 && item.share >= 0.01) tr.className = "off";
    const name = document.createElement("td");
    name.innerHTML = `<b></b><br><small></small>`;
    name.querySelector("b").textContent = item.label || item.layer;
    name.querySelector("small").textContent =
      [item.layer, item.prop, item.paletteKey && `paleta: ${item.paletteKey}`, item.classes.join(", ")]
        .filter(Boolean).join(" · ");
    const colors = document.createElement("td");
    colors.append(swatch(item.color, "štýl"), swatch(item.ours, "naša dlaždica"), swatch(item.ref, "referencia"));
    const nums = document.createElement("td");
    nums.textContent = `ΔE ${item.delta ?? "–"} · ${(item.share * 100).toFixed(1)} %`;
    const act = document.createElement("td");
    const input = document.createElement("input");
    input.type = "color";
    input.value = item.edited || item.color || "#000000";
    const apply = (color, palette) => coloring.set(palette
      ? { palette: item.paletteKey, color }
      : { layer: item.layer, prop: item.prop, color }).catch(showError);
    input.addEventListener("change", () => apply(input.value, false));
    const fromRef = document.createElement("button");
    fromRef.textContent = "← ref";
    fromRef.title = `Farba vrstvy na tomto zoome (z${report.styleZoom}) = farba z referencie`;
    fromRef.disabled = !item.ref || item.layer === "background";
    fromRef.addEventListener("click", () => apply(item.ref, false));
    act.append(input, fromRef);
    if (item.paletteKey) {
      const pal = document.createElement("button");
      pal.textContent = "paleta";
      pal.title = `Kľúč palety „${item.paletteKey}" = farba z referencie (všetky zoomy a vrstvy)`;
      pal.addEventListener("click", () => apply(item.ref, true));
      act.append(pal);
    }
    tr.append(colors, name, nums, act);
    body.append(tr);
  }
  $("symbols").textContent = report.symbols
    .map((s) => `${s.layer} ${s.color || ""} ${(s.share * 100).toFixed(1)} %`).join("\n") || "–";
  $("edits").textContent = JSON.stringify(state.edits, null, 1);
  const { unkept } = darkColors(state.edits);
  $("unkept").textContent = unkept.length
    ? `Tmavá téma prevezme svetlú farbu (vrstva počíta farbu z dát): ${unkept.join(", ")}`
    : "";
  $("done").textContent = `${state.edits.done.length} dlaždíc hotových`;
}

function setStatus(text) {
  $("status").textContent = text;
}

function showError(err) {
  setStatus(`Chyba: ${err.message || err}`);
  console.error(err);
}

function parseTile(text) {
  const [z, x, y] = String(text).split("/").map(Number);
  if (![z, x, y].every(Number.isInteger)) throw new Error(`dlaždica má tvar z/x/y: ${text}`);
  return { z, x, y };
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** The agent's handle: every method resolves to plain JSON. */
const coloring = {
  ready: null,
  tile: () => tile && { ...tile, styleZoom: styleZoomOf(tile.z) },
  region: () => ({ key: regionKey, ...manifest.regions[regionKey] }),
  report: () => report,
  goto: async (z, x, y) => {
    const t = typeof z === "string" ? parseTile(z) : { z, x, y };
    views.ours.jumpTo({ center: tileCenter(t.z, t.x, t.y), zoom: styleZoomOf(t.z) });
    return analyze(t);
  },
  /** `{layer, prop, color, zoom?}` (zoom = style zoom, default the tile's) or `{palette, color}`. */
  set: async (edit) => {
    const zoom = edit.palette ? undefined : edit.zoom ?? styleZoomOf(tile.z);
    state.edits = setColor(state.edits, { ...edit, zoom });
    remember();
    restyle();
    return analyze();
  },
  clear: async (edit) => {
    state.edits = clearColor(state.edits, edit);
    remember();
    restyle();
    return analyze();
  },
  next: async () => {
    if (!state.edits.done.includes(tileKey(tile))) state.edits.done.push(tileKey(tile));
    remember();
    const t = nextTile(tile, manifest.regions[regionKey].bbox);
    if (!t) return { ...report, last: true };
    return coloring.goto(t.z, t.x, t.y);
  },
  edits: () => structuredClone(state.edits),
  loadEdits: async (edits) => {
    state.edits = { ...emptyEdits(), ...edits };
    remember();
    restyle();
    return tile ? analyze() : null;
  },
  /** What saving writes to `style-overrides.json`, plus the colours the dark theme can't keep. */
  overrides: () => ({ overrides: currentOverrides(), unkept: darkColors(state.edits).unkept }),
  images: () => ({ ours: ourImage?.toDataURL("image/png"), ref: refImage?.toDataURL("image/png") }),
  setProvider: async (id, key) => {
    if (!PROVIDERS[id]) throw new Error(`unknown provider: ${id}`);
    state.provider = id;
    if (key != null) apiKey = key;
    remember();
    views.ref.setStyle(refStyle());
    return tile ? analyze() : null;
  },
  save: () => {
    const next = currentOverrides();
    saveOverrides(next);
    baseOverrides = next;
    state.edits = { ...emptyEdits(), done: state.edits.done };
    remember();
    restyle();
    download("style-overrides.json", serializeOverrides(next));
    return next;
  }
};
window.coloring = coloring;

function wireControls() {
  const providerSel = $("provider");
  for (const [id, p] of Object.entries(PROVIDERS)) providerSel.add(new Option(p.label, id));
  providerSel.value = state.provider;
  providerSel.addEventListener("change", () => coloring.setProvider(providerSel.value).catch(showError));
  const keyInput = $("key");
  keyInput.value = apiKey;
  keyInput.addEventListener("change", () => {
    apiKey = keyInput.value.trim();
    try {
      localStorage.setItem(KEY_STORE, apiKey);
    } catch {
      /* private mode */
    }
    coloring.setProvider(state.provider, apiKey).catch(showError);
  });
  $("go").addEventListener("click", () => coloring.goto($("tile").value).catch(showError));
  const step = (dz, dx, dy) => () => {
    const t = dz > 0 ? { z: tile.z + 1, x: tile.x * 2, y: tile.y * 2 }
      : dz < 0 ? { z: tile.z - 1, x: tile.x >> 1, y: tile.y >> 1 }
      : { z: tile.z, x: tile.x + dx, y: tile.y + dy };
    coloring.goto(t.z, t.x, t.y).catch(showError);
  };
  $("left").addEventListener("click", step(0, -1, 0));
  $("right").addEventListener("click", step(0, 1, 0));
  $("up").addEventListener("click", step(0, 0, -1));
  $("down").addEventListener("click", step(0, 0, 1));
  $("zin").addEventListener("click", step(1));
  $("zout").addEventListener("click", step(-1));
  $("next").addEventListener("click", () => coloring.next().catch(showError));
  $("save").addEventListener("click", () => {
    try {
      coloring.save();
      setStatus("Uložené do editora (prehliadač) a stiahnuté ako style-overrides.json.");
    } catch (err) {
      showError(err);
    }
  });
  $("export").addEventListener("click", () => download("coloring-edits.json", JSON.stringify(state.edits, null, 2)));
  $("import").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (file) coloring.loadEdits(JSON.parse(await file.text())).catch(showError);
  });
}

async function main() {
  manifest = await loadJson(`${siteUrl}/tiles/manifest.json`);
  regionKey = params.get("region") && manifest.regions[params.get("region")]
    ? params.get("region") : manifest.default_region || Object.keys(manifest.regions)[0];
  const stored = loadOverrides();
  if (hasOverrides(stored)) baseOverrides = stored;
  else {
    const committed = await loadJson(`${siteUrl}/style-overrides.json`, true);
    if (committed) baseOverrides = normalizeOverrides(committed).overrides;
  }
  iconSet = await loadIconSet();
  roadSigns = await loadSheet(siteUrl, manifest.regions[regionKey]);
  wireControls();
  views = makeViews();
  probe = makeProbe();
  await idle(probe);
  const fromHash = /tile=(\d+\/\d+\/\d+)/.exec(location.hash)?.[1];
  const start = fromHash ? parseTile(fromHash) : state.tile;
  if (start) await coloring.goto(start.z, start.x, start.y);
  else setStatus("Posuň mapu alebo zadaj dlaždicu z/x/y.");
}

coloring.ready = main().catch((err) => {
  showError(err);
  throw err;
});
