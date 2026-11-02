/** Tile math, colour sampling and edits of the coloring tool; no DOM, so tests and the CLI share it. */
import { MAX_DISPLAY_Z, MAX_PAINT_STOPS, DEFAULT_MAP_TYPE, THEMES } from "./themes.js";

/** Reference tiles are 256 px tiles at 2×; MapLibre counts 512 px tiles, one zoom lower. */
export const TILE_PX = 512;
export const styleZoomOf = (z) => z - 1;

/** Edits file shape: colours per layer, paint property and style zoom, and palette keys. */
export function emptyEdits() {
  return { version: 1, layers: {}, palette: {}, done: [] };
}

export function tileBounds(z, x, y) {
  const n = 2 ** z;
  const lon = (i) => (i / n) * 360 - 180;
  const lat = (j) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

export function tileCenter(z, x, y) {
  const [w, , e] = tileBounds(z, x, y);
  // the middle in mercator, not halfway in degrees, or the frame slides off the tile
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 2 ** z))) * 180) / Math.PI;
  return [(w + e) / 2, lat];
}

export function tileAt(lon, lat, z) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** The next tile of the region's bbox at the same zoom, row by row; null past the last. */
export function nextTile({ z, x, y }, bbox) {
  const a = tileAt(bbox[0], bbox[3], z);
  const b = tileAt(bbox[2], bbox[1], z);
  if (x < b.x) return { z, x: x + 1, y };
  if (y < b.y) return { z, x: a.x, y: y + 1 };
  return null;
}

export const tileKey = ({ z, x, y }) => `${z}/${x}/${y}`;

/** Reference url with `{z}/{x}/{y}` and `{key}`; the key never leaves the viewer's browser. */
export const PROVIDERS = {
  "mapy-outdoor": {
    label: "Mapy.com – outdoor",
    url: "https://api.mapy.com/v1/maptiles/outdoor/256@2x/{z}/{x}/{y}?lang=cs&apikey={key}",
    needsKey: true
  },
  "mapy-basic": {
    label: "Mapy.com – basic",
    url: "https://api.mapy.com/v1/maptiles/basic/256@2x/{z}/{x}/{y}?lang=cs&apikey={key}",
    needsKey: true
  },
  "mapy-winter": {
    label: "Mapy.com – winter",
    url: "https://api.mapy.com/v1/maptiles/winter/256@2x/{z}/{x}/{y}?lang=cs&apikey={key}",
    needsKey: true
  }
};

export function providerUrl(id, key, tile) {
  const p = PROVIDERS[id] || PROVIDERS["mapy-outdoor"];
  let url = p.url.replace("{key}", encodeURIComponent(key || ""));
  if (tile) url = url.replace("{z}", tile.z).replace("{x}", tile.x).replace("{y}", tile.y);
  return url;
}

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
export const rgbHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function hexRgb(hex) {
  let s = String(hex).trim().replace(/^#/, "");
  if (s.length <= 4) s = [...s].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

/** An evaluated paint colour (MapLibre `Color` with 0–1 channels, or a css string) as hex. */
export function colorHex(value) {
  if (value == null) return null;
  if (typeof value === "object" && "r" in value) {
    const a = value.a || 1;
    // MapLibre keeps colours premultiplied
    return rgbHex([value.r / a, value.g / a, value.b / a].map((c) => c * 255));
  }
  const s = String(value).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return rgbHex(hexRgb(s));
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) return rgbHex(m[1].split(",").slice(0, 3).map(Number));
  return null;
}

function lab([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** CIE76 ΔE; under ~2.3 the eye sees no difference, under 10 it reads as the same colour. */
export function deltaE(a, b) {
  const [x, y] = [lab(typeof a === "string" ? hexRgb(a) : a), lab(typeof b === "string" ? hexRgb(b) : b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export const SAME_DELTA = 10;
/** Items under this share of the tile are noise for the "tile is done" check. */
export const MIN_SHARE = 0.01;

function median(colors) {
  if (!colors.length) return null;
  const mid = (vals) => {
    const s = [...vals].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  return rgbHex([0, 1, 2].map((i) => mid(colors.map((c) => c[i]))));
}

const COLOR_PROP = {
  background: "background-color",
  fill: "fill-color",
  line: "line-color",
  circle: "circle-color",
  symbol: "text-color",
  "fill-extrusion": "fill-extrusion-color"
};

/** The paint property that gives the layer its colour. */
export const colorPropOf = (type) => COLOR_PROP[type] || null;

/**
 * One sample per grid point: the topmost feature there, its evaluated colour and the two pixels.
 *
 * @param {object[]} samples  `{layer, type, meta, color, props, ours: [r,g,b], ref: [r,g,b], at: [x,y]}`
 *                            with `layer` null where only the background shows
 */
export function summarize(samples, { palette = {} } = {}) {
  const groups = new Map();
  for (const s of samples) {
    const layer = s.layer || "background";
    const key = `${layer}|${s.color || ""}`;
    let g = groups.get(key);
    if (!g) {
      const meta = s.meta || {};
      const prop = colorPropOf(s.type || "background");
      const direct = (meta["frico:palette"] || {})[prop];
      const extra = meta["frico:palette-extra"] || [];
      const byColor = extra.filter((k) => palette[k] && s.color && deltaE(palette[k], s.color) < 1);
      g = {
        layer,
        type: s.type || "background",
        prop,
        label: meta["frico:label"] || null,
        group: meta["frico:group"] || null,
        color: s.color || null,
        paletteKey: direct || (byColor.length === 1 ? byColor[0] : null),
        dataDriven: !direct && extra.length > 0,
        classes: new Map(),
        ours: [],
        ref: [],
        at: s.at
      };
      groups.set(key, g);
    }
    const cls = [s.props?.class, s.props?.subclass].filter(Boolean).join("/");
    if (cls) g.classes.set(cls, (g.classes.get(cls) || 0) + 1);
    g.ours.push(s.ours);
    g.ref.push(s.ref);
  }
  const total = samples.length || 1;
  const items = [...groups.values()].map((g) => {
    const ours = median(g.ours);
    const ref = median(g.ref);
    return {
      layer: g.layer,
      type: g.type,
      prop: g.prop,
      label: g.label,
      group: g.group,
      color: g.color,
      paletteKey: g.paletteKey,
      dataDriven: g.dataDriven,
      classes: [...g.classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c),
      share: Math.round((g.ours.length / total) * 1000) / 1000,
      ours,
      ref,
      delta: ours && ref ? Math.round(deltaE(ours, ref) * 10) / 10 : null,
      at: g.at
    };
  });
  return items.sort((a, b) => b.share - a.share);
}

/** True when every item worth counting already looks like the reference. */
export function tileMatches(items, limit = SAME_DELTA) {
  return items.filter((i) => i.share >= MIN_SHARE).every((i) => i.delta == null || i.delta < limit);
}

/** Records a colour; with `palette` the theme key, else the layer's property at one style zoom. */
export function setColor(edits, { layer, prop, zoom, palette, color }) {
  const hex = colorHex(color);
  if (!hex) throw new Error(`not a colour: ${color}`);
  const next = structuredClone(edits);
  if (palette) {
    if (!(palette in THEMES.svetla)) throw new Error(`unknown palette key: ${palette}`);
    next.palette[palette] = hex;
    return next;
  }
  if (!layer || !prop || !Number.isInteger(zoom)) throw new Error("layer, prop and an integer zoom are needed");
  ((next.layers[layer] ||= {})[prop] ||= {})[zoom] = hex;
  return next;
}

export function clearColor(edits, { layer, prop, zoom, palette }) {
  const next = structuredClone(edits);
  if (palette) delete next.palette[palette];
  else if (next.layers[layer]?.[prop]) {
    if (zoom == null) delete next.layers[layer][prop];
    else delete next.layers[layer][prop][zoom];
    if (!Object.keys(next.layers[layer][prop] || {}).length) delete next.layers[layer][prop];
    if (!Object.keys(next.layers[layer]).length) delete next.layers[layer];
  }
  return next;
}

/** Colours per zoom as one paint value: a colour, or bands where a zoom keeps its colour up to the next. */
export function zoomValue(byZoom) {
  const stops = Object.entries(byZoom).map(([z, c]) => [Number(z), c]).sort((a, b) => a[0] - b[0]);
  const merged = stops.filter((s, i) => i === 0 || s[1] !== stops[i - 1][1]);
  if (merged.length === 1) return merged[0][1];
  if (merged.length > MAX_PAINT_STOPS) {
    throw new Error(`${merged.length} colour bands, at most ${MAX_PAINT_STOPS}`);
  }
  return merged.map(([z, c], i) => [i === 0 ? 0 : z,
    i + 1 < merged.length ? merged[i + 1][0] - 1 : MAX_DISPLAY_Z, c]);
}

/**
 * Overrides with the edits in: layer colours on the default map, palette keys on the light theme.
 *
 * `paint` also colours the dark theme, so `darkColors` (`{layer: {prop: hex}}`, the dark style's own
 * colours) keeps it as it was where it has no `paintDark` yet.
 */
export function applyEdits(overrides, edits, { darkColors = {}, mapType = DEFAULT_MAP_TYPE } = {}) {
  const out = structuredClone(overrides);
  if (Object.keys(edits.palette || {}).length) {
    out.palette = { ...(out.palette || {}), svetla: { ...(out.palette?.svetla || {}), ...edits.palette } };
  }
  const layers = Object.entries(edits.layers || {});
  if (!layers.length) return out;
  out.maps ||= {};
  out.maps[mapType] ||= {};
  out.maps[mapType].layers ||= {};
  const target = out.maps[mapType].layers;
  for (const [id, props] of layers) {
    const def = (target[id] = { ...(target[id] || {}) });
    for (const [prop, byZoom] of Object.entries(props)) {
      if (!Object.keys(byZoom).length) continue;
      def.paint = { ...(def.paint || {}), [prop]: zoomValue(byZoom) };
      const dark = darkColors[id]?.[prop];
      const kept = def.paintDark?.[prop] || out.layers?.[id]?.paintDark?.[prop];
      if (dark && !kept) def.paintDark = { ...(def.paintDark || {}), [prop]: dark };
    }
  }
  return out;
}

/** The dark style's own colour of every edited layer; `unkept` lists those it computes per feature. */
export function darkColorsOf(darkStyle, edits) {
  const colors = {};
  const unkept = [];
  for (const [id, props] of Object.entries(edits.layers || {})) {
    const layer = darkStyle.layers.find((l) => l.id === id);
    for (const prop of Object.keys(props)) {
      const hex = typeof layer?.paint?.[prop] === "string" ? colorHex(layer.paint[prop]) : null;
      if (hex) (colors[id] ||= {})[prop] = hex;
      else unkept.push(`${id} ${prop}`);
    }
  }
  return { colors, unkept };
}
