#!/usr/bin/env python3
"""Which OSM objects more than one package carries, read off a built `_site/tiles`.

    python3 workers/tools/overlap.py --tiles=_site/tiles --out=overlap.md

A feature is known by its tile id, which Planetiler makes the OSM id × 10 + 1 node, 2 way,
3 relation, in our schemas and in the base map's cuts alike; a merged one has none.
"""
import argparse
import gzip
import json
import os
import sys
from collections import Counter, defaultdict
from itertools import combinations

_WORKERS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(os.path.dirname(_WORKERS), "config", "packages.json")
OSM_TYPES = {1: "node", 2: "way", 3: "relation"}
# archives no style draws
SKIPPED_SUFFIXES = ("-routing.pmtiles", "-terrain.pmtiles", "-contours.pmtiles", "-rocks.pmtiles",
                    "-aerial_summer.pmtiles", "-aerial_winter.pmtiles")


def package_suffixes(registry=REGISTRY):
    """`(file ending, package)` longest first, so `-omt-roads` beats `-roads`."""
    with open(registry, encoding="utf-8") as f:
        packages = json.load(f)["packages"]
    pairs = [(s, p["key"]) for p in packages for s in p.get("suffixes") or []
             if s.endswith(".pmtiles")]
    return sorted(pairs, key=lambda pair: -len(pair[0]))


def package_of(name, suffixes):
    if name.endswith(SKIPPED_SUFFIXES):
        return None
    return next((package for suffix, package in suffixes if name.endswith(suffix)), None)


def osm_object(feature_id):
    """`way/123` from a tile id; None for a feature Planetiler merged or made up."""
    if not feature_id or feature_id % 10 not in OSM_TYPES:
        return None
    return f"{OSM_TYPES[feature_id % 10]}/{feature_id // 10}"


def kind_of(layer, props):
    kind = props.get("class") or props.get("subclass")
    return f"{layer}:{kind}" if kind else layer


def read_archive(path):
    """`{osm object: (kind, name)}` of every tile of one archive."""
    import mapbox_vector_tile as mvt
    from pmtiles.reader import MmapSource, Reader, all_tiles
    found = {}
    with open(path, "rb") as f:
        for _zxy, data in all_tiles(Reader(MmapSource(f)).get_bytes):
            tile = mvt.decode(gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data)
            for layer, content in tile.items():
                for feature in content["features"]:
                    key = osm_object(feature.get("id"))
                    if key and key not in found:
                        props = feature.get("properties") or {}
                        found[key] = (kind_of(layer, props), props.get("name") or props.get("piste_name"))
    return found


def by_package(tiles_dir, suffixes):
    """`{package: {osm object: (kinds, name)}}`, kinds from every archive of the package, and the
    archives that name no OSM object at all."""
    held, blind = defaultdict(dict), []
    for name in sorted(os.listdir(tiles_dir)):
        package = package_of(name, suffixes)
        if not package:
            continue
        found = read_archive(os.path.join(tiles_dir, name))
        if not found:
            blind.append(name)
        for key, (kind, label) in found.items():
            kinds, known = held[package].get(key, ((), None))
            held[package][key] = (kinds if kind in kinds else kinds + (kind,), known or label)
    return held, blind


def overlaps(held):
    """`{(a, b): {osm object: (what a has, what b has)}}` for every pair sharing one."""
    shared = {}
    for a, b in combinations(sorted(held), 2):
        common = held[a].keys() & held[b].keys()
        if common:
            shared[(a, b)] = {key: (held[a][key], held[b][key]) for key in common}
    return shared


def report(held, shared, examples=3, blind=(), rows=0):
    lines = ["# Objects more than one package carries", "",
             "| Package | Objects |", "|---|---:|"]
    lines += [f"| {p} | {len(objects)} |" for p, objects in sorted(held.items())]
    if blind:
        lines += ["", "Not compared, no feature carries an OSM id: " + ", ".join(blind) + "."]
    lines += ["", "| Packages | Shared objects |", "|---|---:|"]
    ranked = sorted(shared.items(), key=lambda item: -len(item[1]))
    lines += [f"| {a} + {b} | {len(objects)} |" for (a, b), objects in ranked]
    for (a, b), objects in ranked:
        lines += ["", f"## {a} + {b}", "",
                  f"| {a} | {b} | Objects | For example |", "|---|---|---:|---|"]
        pair = {key: (" / ".join(left[0]), " / ".join(right[0])) for key, (left, right) in objects.items()}
        for (left, right), count in Counter(pair.values()).most_common(rows or None):
            seen = [f"[{label(objects[key][0][1] or objects[key][1][1] or key)}]"
                    f"(https://www.openstreetmap.org/{key})"
                    for key in sorted(pair) if pair[key] == (left, right)][:examples]
            lines.append(f"| {left} | {right} | {count} | {', '.join(seen)} |")
    return "\n".join(lines) + "\n"


def label(text):
    return str(text).replace("|", "/").replace("[", "(").replace("]", ")")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tiles", default="_site/tiles")
    ap.add_argument("--out", default="", help="Markdown report; standard output without it")
    ap.add_argument("--examples", type=int, default=3)
    ap.add_argument("--rows", type=int, default=0, help="kinds listed per pair; 0 is all")
    args = ap.parse_args(argv)
    held, blind = by_package(args.tiles, package_suffixes())
    if not held:
        print(f"::error::{args.tiles} holds no package's archive.")
        return 1
    text = report(held, overlaps(held), args.examples, blind, args.rows)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
