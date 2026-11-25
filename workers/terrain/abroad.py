#!/usr/bin/env python3
"""A VRT of Copernicus GLO-30 over the bbox, for the ground beyond the state border.

GLO-30 is a surface model, so it never stands in for ours inside the state: only
`tiles.py --abroad-dem` reads it, past the border. The COGs are read in place
(`/vsicurl/`), so a low zoom takes their overviews, not whole 1° tiles.

Usage:
    python3 workers/terrain/abroad.py --bbox=20,48.7,22.6,49.6 --out=dem/abroad.vrt
"""
import argparse
import math
import os
import subprocess
import sys

BASE = "https://copernicus-dem-30m.s3.amazonaws.com"
# low zooms reach far past the region; a nearer edge is a step there
PAD_DEG = 2.0


def tile_name(lat, lon):
    ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
    ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
    return f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM"


def tile_urls(w, s, e, n, pad=PAD_DEG):
    """`/vsicurl/` paths of the 1° tiles covering the padded bbox."""
    lats = range(math.floor(max(s - pad, -90)), math.ceil(min(n + pad, 90)))
    lons = range(math.floor(max(w - pad, -180)), math.ceil(min(e + pad, 180)))
    return [f"/vsicurl/{BASE}/{tile_name(la, lo)}/{tile_name(la, lo)}.tif"
            for la in lats for lo in lons]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True, help="west,south,east,north")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    w, s, e, n = (float(v) for v in args.bbox.split(","))
    urls = tile_urls(w, s, e, n)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    # a missing tile (sea) is skipped by `gdalbuildvrt` with a warning
    env = dict(os.environ, GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="5",
               GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR")
    run = subprocess.run(["gdalbuildvrt", "-q", args.out, *urls], env=env)
    if run.returncode or not os.path.exists(args.out):
        print("::warning::Copernicus GLO-30 couldn't be read – beyond the state "
              "border is the plane, as within it.")
        return 1
    print(f"Copernicus GLO-30 beyond the state border: {len(urls)} tiles "
          f"around the bbox, read in place → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
