#!/usr/bin/env python3
"""Name the advanced height model in `_site/tiles/manifest.json`, where packaging finds it.

It joins `_site` only after the Pages deploy (1–3 GB is no page), so the manifest
`site.sh` wrote lacks it, and a regeneration has none at all; without the file
nothing changes.

    python3 workers/terrain/advanced-site.py --site=_site --region=bratislavsky
"""

import argparse
import json
import os

KEY = "terrain_advanced"
SUFFIX = "-terrain-advanced.pmtiles"


def max_zoom(path):
    """The top zoom from a PMTiles v3 header, or None for another file."""
    with open(path, "rb") as f:
        head = f.read(102)
    return head[101] if head[:7] == b"PMTiles" and len(head) == 102 else None


def add(site, region):
    """The top zoom now in the region's manifest entry, or None without the file."""
    rel = f"tiles/{region}{SUFFIX}"
    archive = os.path.join(site, rel)
    if not os.path.isfile(archive):
        return None
    zoom = max_zoom(archive)
    if zoom is None:
        raise SystemExit(f"{archive} isn't a PMTiles v3 archive")
    path = os.path.join(site, "tiles", "manifest.json")
    man = {}
    if os.path.isfile(path):
        with open(path) as f:
            man = json.load(f)
    entry = man.setdefault("regions", {}).setdefault(region, {})
    entry[KEY] = rel
    entry[f"{KEY}_maxzoom"] = zoom
    man.setdefault("default_region", region)
    with open(path, "w") as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return zoom


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="_site")
    ap.add_argument("--region", required=True)
    args = ap.parse_args()
    zoom = add(args.site, args.region)
    if zoom is None:
        print(f"No advanced height model of {args.region} in {args.site} – the manifest stays as it was.")
    else:
        print(f"Advanced height model of {args.region} to z{zoom} is in the manifest.")


if __name__ == "__main__":
    main()
