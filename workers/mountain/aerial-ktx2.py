#!/usr/bin/env python3
"""A photo archive's JPEG or WebP tiles → the same archive with KTX2 tiles.

python3 workers/mountain/aerial-ktx2.py vysoke_tatry-aerial_summer.pmtiles out.pmtiles --jobs=8
"""

import argparse
import importlib.util
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


aerial = _load("aerial", os.path.join(_HERE, "aerial.py"))


def convert(src, out, jobs=os.cpu_count() or 1):
    """Every tile of `src` as KTX2 in `out`, under the same header and bounds."""
    from pmtiles.reader import MmapSource, Reader, all_tiles  # noqa: PLC0415
    from pmtiles.tile import TileType, zxy_to_tileid  # noqa: PLC0415
    from pmtiles.writer import Writer  # noqa: PLC0415

    with tempfile.TemporaryDirectory() as tmp, open(src, "rb") as f:
        source = MmapSource(f)
        header, metadata = Reader(source).header(), Reader(source).metadata()
        suffix = ".webp" if header["tile_type"] == TileType.WEBP else ".jpg"

        def one(item):
            (z, x, y), data = item
            path = os.path.join(tmp, f"{z}-{x}-{y}{suffix}")
            with open(path, "wb") as t:
                t.write(data)
            ktx2 = aerial.as_ktx2(path)
            os.remove(path)
            return (z, x, y), ktx2

        with ThreadPoolExecutor(jobs) as pool:
            tiles = dict(pool.map(one, all_tiles(source)))

        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "wb") as o:
            writer = Writer(o)
            for zxy in sorted(tiles, key=lambda t: zxy_to_tileid(*t)):
                with open(tiles[zxy], "rb") as t:
                    writer.write_tile(zxy_to_tileid(*zxy), t.read())
            header = {k: v for k, v in header.items() if not k.endswith(("_offset", "_bytes", "_count"))}
            header.pop("clustered", None)
            writer.finalize({**header, "tile_type": TileType.UNKNOWN}, {**metadata, "format": "ktx2"})
    return len(tiles)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    args = ap.parse_args()
    count = convert(args.src, args.out, args.jobs)
    before, after = os.path.getsize(args.src), os.path.getsize(args.out)
    print(f"{args.out}: {count} tiles, {before / 1048576:.0f} → {after / 1048576:.0f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
