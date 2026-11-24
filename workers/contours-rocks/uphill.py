#!/usr/bin/env python3
"""Turn every contour so the higher ground is on its left, where a label's top points."""
import argparse
import gzip
import importlib.util
import os
import sys

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, zxy_to_tileid
from pmtiles.writer import Writer

_spec = importlib.util.spec_from_file_location(
    "lift", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "tiles", "lift-landcover.py"))
lift = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lift)

LAYER = "contour"


def reversed_geometry(geom):
    """The same line or lines, each run backwards."""
    if geom["type"] == "LineString":
        return {"type": "LineString", "coordinates": geom["coordinates"][::-1]}
    if geom["type"] == "MultiLineString":
        return {"type": "MultiLineString", "coordinates": [p[::-1] for p in geom["coordinates"]]}
    return geom


def turned(raw):
    """A tile's bytes with its contours reversed and marked `uphill`, or None without contours."""
    rest, own = lift.split(raw, LAYER)
    if not own:
        return None
    layer = mapbox_vector_tile.decode(own, default_options={"y_coord_down": True})[LAYER]
    features = []
    for f in layer["features"]:
        props = dict(f["properties"], uphill=1)
        out = {"geometry": reversed_geometry(f["geometry"]), "properties": props}
        if f.get("id") is not None:
            out["id"] = f["id"]
        features.append(out)
    # the tile's own coordinates go back as they came, so no quantising moves a line
    return rest + mapbox_vector_tile.encode(
        [{"name": LAYER, "features": features}],
        default_options={"extents": layer.get("extent", 4096), "y_coord_down": True})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    args = ap.parse_args()
    tmp = args.archive + ".uphill"
    done = 0
    with open(args.archive, "rb") as src:
        reader = Reader(MmapSource(src))
        header, metadata = reader.header(), reader.metadata()
        gz = header["tile_compression"] == Compression.GZIP
        with open(tmp, "wb") as dst:
            writer = Writer(dst)
            for (z, x, y), data in sorted(all_tiles(reader.get_bytes),
                                          key=lambda t: zxy_to_tileid(*t[0])):
                raw = gzip.decompress(data) if gz else data
                new = turned(raw)
                if new is not None:
                    # mtime=0, or equal tiles hash apart and lose deduplication
                    data = gzip.compress(new, 9, mtime=0) if gz else new
                    done += 1
                writer.write_tile(zxy_to_tileid(z, x, y), data)
            for v in metadata.get("vector_layers") or []:
                if v.get("id") == LAYER:
                    v.setdefault("fields", {})["uphill"] = "Number"
            writer.finalize(header, metadata)
    os.replace(tmp, args.archive)
    print(f"{args.archive}: contours of {done} tiles turned uphill", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
