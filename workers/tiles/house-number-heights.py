#!/usr/bin/env python3
"""Give each house number the height of the building it is on, for a 3D map's roofs."""
import argparse
import gzip
import math
import os
import sys

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.geometry import shape
from shapely.strtree import STRtree

NUMBERS = "housenumber"
BUILDINGS = "building"


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


def metres_per_unit(z, y, extent):
    lat = math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2 ** z)))
    return 40075016.686 * math.cos(lat) / 2 ** z / extent


def decoded(own, name):
    return mapbox_vector_tile.decode(own, default_options={"y_coord_down": True})[name]


def valid(geom):
    return geom if geom.is_valid else geom.buffer(0)


def lift(numbers, buildings, reach):
    """`numbers` with the height of the building each one is on, `reach` in tile units."""
    solid = [(valid(shape(f["geometry"])), f["properties"].get("render_height"))
             for f in buildings["features"]
             if f["geometry"]["type"].endswith("Polygon")]
    solid = [(g, h) for g, h in solid if h is not None]
    if not solid:
        return numbers["features"], 0
    tree = STRtree([g for g, _ in solid])
    features, lifted = [], 0
    for f in numbers["features"]:
        near = tree.query_nearest(shape(f["geometry"]), max_distance=reach) \
            if f["geometry"]["type"] == "Point" else []
        if len(near):
            height = solid[int(near[0])][1]
            f = {**f, "properties": {**f["properties"], "render_height": height}}
            lifted += 1
        features.append({**f, "geometry": shape(f["geometry"])})
    return features, lifted


def rewrite(raw, z, y, reach_m):
    """The tile with its house numbers lifted, and how many were."""
    rest, own = split(raw, NUMBERS)
    _, building_bytes = split(raw, BUILDINGS)
    if not own or not building_bytes:
        return raw, 0
    numbers = decoded(own, NUMBERS)
    extent = numbers.get("extent", 4096)
    features, lifted = lift(numbers, decoded(building_bytes, BUILDINGS),
                            reach_m / metres_per_unit(z, y, extent))
    layer = mapbox_vector_tile.encode(
        [{"name": NUMBERS, "features": features}],
        default_options={"extents": extent, "y_coord_down": True})
    return rest + layer, lifted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("--reach", type=float, default=3,
                    help="metres outside a wall still its building's")
    args = ap.parse_args()
    tmp = args.archive + ".numbers"
    lifted = tiles = 0
    with open(args.archive, "rb") as src:
        reader = Reader(MmapSource(src))
        header, metadata = reader.header(), reader.metadata()
        gz = header["tile_compression"] == Compression.GZIP
        with open(tmp, "wb") as dst:
            writer = Writer(dst)
            for (z, x, y), data in sorted(all_tiles(reader.get_bytes),
                                          key=lambda t: zxy_to_tileid(*t[0])):
                raw = gzip.decompress(data) if gz else data
                new, n = rewrite(raw, z, y, args.reach)
                if new is not raw:
                    # mtime=0, or equal tiles hash apart and lose deduplication
                    data = gzip.compress(new, 9, mtime=0) if gz else new
                    tiles += 1
                    lifted += n
                writer.write_tile(zxy_to_tileid(z, x, y), data)
            writer.finalize(header, metadata)
    os.replace(tmp, args.archive)
    print(f"{args.archive}: house numbers in {tiles} tiles, {lifted} at their building's height",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
