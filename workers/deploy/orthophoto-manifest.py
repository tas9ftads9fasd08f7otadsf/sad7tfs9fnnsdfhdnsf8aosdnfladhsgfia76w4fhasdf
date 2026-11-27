#!/usr/bin/env python3
"""A region's orthophotos in `_site/tiles/manifest.json`, beside what it already says.

python3 workers/deploy/orthophoto-manifest.py --site=_site --region=presovsky --source=ortofoto_sk_3c
"""

import argparse
import json
import os
import sys


def pmtiles_zooms(path):
    """(min, max) zoom from a PMTiles v3 header, or None for another file."""
    with open(path, "rb") as f:
        head = f.read(102)
    return (head[100], head[101]) if head[:7] == b"PMTiles" and len(head) == 102 else None


def add(manifest, region, archive, source, zooms):
    """The manifest with the region's `orthophoto` keys; the region becomes its default."""
    out = dict(manifest)
    regions = dict(out.get("regions") or {})
    entry = dict(regions.get(region) or {})
    entry["orthophoto"] = archive
    entry["orthophoto_maxzoom"] = zooms[1]
    if source:
        entry["orthophoto_source"] = source
    regions[region] = entry
    out["regions"] = regions
    out.setdefault("default_region", region)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default="_site")
    ap.add_argument("--region", required=True)
    ap.add_argument("--source", default="")
    args = ap.parse_args()

    rel = f"tiles/{args.region}-orthophoto.pmtiles"
    zooms = os.path.isfile(os.path.join(args.site, rel)) and pmtiles_zooms(os.path.join(args.site, rel))
    if not zooms:
        print(f"::error::{args.site}/{rel} is no PMTiles archive – no orthophotos to name.", file=sys.stderr)
        return 1
    path = os.path.join(args.site, "tiles", "manifest.json")
    try:
        with open(path, encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {}
    data = add(manifest, args.region, rel, args.source, zooms)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(json.dumps(data["regions"][args.region], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
