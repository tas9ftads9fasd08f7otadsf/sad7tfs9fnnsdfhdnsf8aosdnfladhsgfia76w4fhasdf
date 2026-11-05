#!/usr/bin/env python3
"""Rebuild low-zoom landcover from the zoom above, keeping the holes Planetiler fills."""
import argparse
import gzip
import os
import sys
from collections import defaultdict

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.affinity import affine_transform
from shapely.geometry import MultiPolygon, Polygon, box, shape
from shapely.ops import unary_union

LAYER = "landcover"


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def skip(b, i, wire):
    if wire == 0:
        return varint(b, i)[1]
    if wire == 1:
        return i + 8
    if wire == 2:
        n, i = varint(b, i)
        return i + n
    if wire == 5:
        return i + 4
    raise ValueError(f"wire type {wire}")


def layer_name(body):
    i = 0
    while i < len(body):
        key, i = varint(body, i)
        if key == (1 << 3 | 2):
            n, i = varint(body, i)
            return body[i:i + n].decode()
        i = skip(body, i, key & 7)
    return None


def split(raw, name):
    """The tile's bytes without layer `name`, and that layer's own bytes."""
    rest, own = bytearray(), b""
    i = 0
    while i < len(raw):
        start = i
        key, i = varint(raw, i)
        end = skip(raw, i, key & 7)
        if key == (3 << 3 | 2):
            n, j = varint(raw, i)
            if layer_name(raw[j:j + n]) == name:
                own = raw[start:end]
                i = end
                continue
        rest += raw[start:end]
        i = end
    return bytes(rest), own


def polygons(geom):
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for part in getattr(geom, "geoms", []) for g in polygons(part)]


def tidy(geom, min_area, tolerance):
    """Drop the parts and holes smaller than `min_area`."""
    kept = []
    for p in polygons(geom.simplify(tolerance, preserve_topology=True)):
        if p.area < min_area:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= min_area]
        kept.append(Polygon(p.exterior, holes))
    return MultiPolygon(kept) if len(kept) > 1 else (kept[0] if kept else None)


class Lifter:
    def __init__(self, reader, gz, top, min_px, margin_px):
        self.reader, self.gz, self.top = reader, gz, top
        self.min_px, self.margin_px = min_px, margin_px
        self.memo = {}

    def features(self, z, x, y):
        """Landcover of a tile as (properties, geometry in its pixels, extent)."""
        if z < self.top:
            return self.lifted(z, x, y)
        data = self.reader.get(z, x, y)
        if not data:
            return []
        raw = gzip.decompress(data) if self.gz else data
        _, own = split(raw, LAYER)
        if not own:
            return []
        layer = mapbox_vector_tile.decode(own, default_options={"y_coord_down": True})[LAYER]
        extent = layer.get("extent", 4096)
        return [(f["properties"], shape(f["geometry"]), extent) for f in layer["features"]
                if f["geometry"]["type"].endswith("Polygon")]

    def lifted(self, z, x, y):
        if (z, x, y) in self.memo:
            return self.memo[(z, x, y)]
        extent = 4096
        half = extent / 2
        margin = self.margin_px * extent / 256
        groups = defaultdict(list)
        for dx in (0, 1):
            for dy in (0, 1):
                x0, y0 = dx * half, dy * half
                # only a tile's outer edges keep their buffer; inside, children meet
                cut = box(x0 - margin if dx == 0 else x0, y0 - margin if dy == 0 else y0,
                          x0 + half + (margin if dx == 1 else 0),
                          y0 + half + (margin if dy == 1 else 0))
                for props, geom, child_extent in self.features(z + 1, 2 * x + dx, 2 * y + dy):
                    s = half / child_extent
                    placed = affine_transform(geom.buffer(0), [s, 0, 0, s, x0, y0])
                    part = placed.intersection(cut)
                    if not part.is_empty:
                        groups[tuple(sorted(props.items()))].append(part)
        px = extent / 256
        out = []
        for key, parts in groups.items():
            geom = tidy(unary_union(parts), (self.min_px * px) ** 2, px / 4)
            if geom is not None:
                out.append((dict(key), geom, extent))
        self.memo[(z, x, y)] = out
        return out

    def layer(self, z, x, y):
        feats = self.lifted(z, x, y)
        if not feats:
            return b""
        return mapbox_vector_tile.encode(
            [{"name": LAYER, "features": [{"geometry": g, "properties": p} for p, g, _ in feats]}],
            default_options={"extents": feats[0][2], "y_coord_down": True})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("--top", type=int, default=13, help="the zoom whose landcover is kept")
    ap.add_argument("--down-to", type=int, default=11)
    ap.add_argument("--min-px", type=float, default=2)
    ap.add_argument("--margin-px", type=float, default=2)
    args = ap.parse_args()
    before = os.path.getsize(args.archive)
    tmp = args.archive + ".lifting"
    rebuilt = 0
    with open(args.archive, "rb") as src:
        reader = Reader(MmapSource(src))
        header, metadata = reader.header(), reader.metadata()
        if header["max_zoom"] < args.top:
            print(f"{args.archive}: no z{args.top}, landcover left as it is", file=sys.stderr)
            return 0
        gz = header["tile_compression"] == Compression.GZIP
        lifter = Lifter(reader, gz, args.top, args.min_px, args.margin_px)
        with open(tmp, "wb") as dst:
            writer = Writer(dst)
            for (z, x, y), data in sorted(all_tiles(reader.get_bytes),
                                          key=lambda t: zxy_to_tileid(*t[0])):
                if args.down_to <= z < args.top:
                    raw = gzip.decompress(data) if gz else data
                    rest, own = split(raw, LAYER)
                    if own:
                        new = rest + lifter.layer(z, x, y)
                        # mtime=0, or equal tiles hash apart and lose deduplication
                        data = gzip.compress(new, 9, mtime=0) if gz else new
                        rebuilt += 1
                writer.write_tile(zxy_to_tileid(z, x, y), data)
            writer.finalize(header, metadata)
    os.replace(tmp, args.archive)
    print(f"{args.archive}: landcover of {rebuilt} tiles at z{args.down_to}–{args.top - 1} "
          f"rebuilt from z{args.top}, {before / 1048576:.1f} → "
          f"{os.path.getsize(args.archive) / 1048576:.1f} MB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
