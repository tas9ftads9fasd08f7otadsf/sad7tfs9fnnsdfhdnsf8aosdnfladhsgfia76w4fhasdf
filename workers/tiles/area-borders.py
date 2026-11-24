#!/usr/bin/env python3
"""Add each protected and military area's border as a line running clockwise around it."""
import argparse
import gzip
import importlib.util
import os
import sys
from collections import defaultdict

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.affinity import translate
from shapely.geometry import LineString, MultiLineString, box, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

_spec = importlib.util.spec_from_file_location(
    "lift", os.path.join(os.path.dirname(os.path.abspath(__file__)), "lift-landcover.py"))
lift = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lift)

# (source layer, the classes taken or None for all, border layer)
RULES = [("park", None, "park_border"), ("landuse", {"military"}, "military_border")]
# the style's band is wider than the base map's 8 px buffer, so its line reaches further
BUFFER_PX = 32
# a 22 px band along every kink of an OSM border folds over itself
SIMPLIFY_PX = 2
TILE_PX = 512


def areas(reader, gz, z, x, y, source, classes):
    """The tile's areas of `source` as `{id: (properties, polygon in tile units, extent)}`."""
    data = reader.get(z, x, y)
    if not data:
        return {}
    raw = gzip.decompress(data) if gz else data
    _, own = lift.split(raw, source)
    if not own:
        return {}
    layer = mapbox_vector_tile.decode(own, default_options={"y_coord_down": True})[source]
    out = {}
    for f in layer["features"]:
        if f.get("id") is None or not f["geometry"]["type"].endswith("Polygon"):
            continue
        if classes is not None and f["properties"].get("class") not in classes:
            continue
        out[f["id"]] = (f["properties"], shape(f["geometry"]).buffer(0), layer.get("extent", 4096))
    return out


def lines(geom):
    if isinstance(geom, LineString):
        return [geom]
    return [g for part in getattr(geom, "geoms", []) for g in lines(part)]


def border(polygon, extent):
    """Rings of `polygon` around the tile, clockwise on screen, so the area is on their right."""
    reach = BUFFER_PX * extent / TILE_PX
    window = box(-reach, -reach, extent + reach, extent + reach)
    rings = []
    smooth = polygon.simplify(SIMPLIFY_PX * extent / TILE_PX, preserve_topology=True)
    for part in lift.polygons(smooth):
        # y points down: shapely's counter-clockwise exterior is clockwise on screen
        p = orient(part, 1.0)
        rings += [LineString(p.exterior.coords)] + [LineString(h.coords) for h in p.interiors]
    kept = [seg for ring in rings for seg in lines(ring.intersection(window)) if seg.length > 0]
    return MultiLineString(kept) if kept else None


class Borders:
    def __init__(self, reader, gz, source, classes, name):
        self.reader, self.gz = reader, gz
        self.source, self.classes, self.name = source, classes, name
        self.memo = {}

    def areas(self, z, x, y):
        if (z, x, y) not in self.memo:
            self.memo[(z, x, y)] = areas(self.reader, self.gz, z, x, y, self.source, self.classes)
        return self.memo[(z, x, y)]

    def layer(self, z, x, y):
        own = self.areas(z, x, y)
        if not own:
            return b""
        extent = next(iter(own.values()))[2]
        parts = defaultdict(list)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for fid, (_, geom, ext) in self.areas(z, x + dx, y + dy).items():
                    if fid in own and ext == extent:
                        parts[fid].append(translate(geom, dx * extent, dy * extent))
        features = []
        for fid, pieces in parts.items():
            # the neighbours' buffers overlap; their union is the area without the cut edges
            line = border(unary_union(pieces), extent)
            if line is not None:
                features.append({"geometry": line, "id": fid,
                                 "properties": {"class": own[fid][0].get("class", "")}})
        if not features:
            return b""
        return mapbox_vector_tile.encode(
            [{"name": self.name, "features": features}],
            default_options={"extents": extent, "y_coord_down": True})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("--from-z", type=int, default=11)
    args = ap.parse_args()
    tmp = args.archive + ".borders"
    added = 0
    with open(args.archive, "rb") as src:
        reader = Reader(MmapSource(src))
        header, metadata = reader.header(), reader.metadata()
        gz = header["tile_compression"] == Compression.GZIP
        borders = [Borders(reader, gz, *rule) for rule in RULES]
        with open(tmp, "wb") as dst:
            writer = Writer(dst)
            for (z, x, y), data in sorted(all_tiles(reader.get_bytes),
                                          key=lambda t: zxy_to_tileid(*t[0])):
                if z >= args.from_z:
                    raw = gzip.decompress(data) if gz else data
                    for b in borders:
                        raw, _ = lift.split(raw, b.name)
                    extra = b"".join(b.layer(z, x, y) for b in borders)
                    if extra:
                        # mtime=0, or equal tiles hash apart and lose deduplication
                        data = gzip.compress(raw + extra, 9, mtime=0) if gz else raw + extra
                        added += 1
                writer.write_tile(zxy_to_tileid(z, x, y), data)
            layers = metadata.get("vector_layers")
            for b in borders:
                if isinstance(layers, list) and not any(v.get("id") == b.name for v in layers):
                    layers.append({"id": b.name, "fields": {"class": "String"},
                                   "minzoom": args.from_z, "maxzoom": header["max_zoom"]})
            writer.finalize(header, metadata)
    os.replace(tmp, args.archive)
    print(f"{args.archive}: area borders in {added} tiles from z{args.from_z}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
