#!/usr/bin/env python3
"""Geographical names: the prefilter passes what the schema asks for, and every kind is named."""
import os
import sys

import yaml

_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKERS = os.path.dirname(_HERE)
SCHEMA = os.path.join(_WORKERS, "names", "names.yml")
FILTER = os.path.join(_WORKERS, "names", "filter.txt")
BUILD = os.path.join(_WORKERS, "names", "build.sh")

# the app switches each of these on and off by its layer id
KINDS = ("city", "village", "settlement", "mountain", "valley", "plain", "region")
EVERY_BLOCK = ("class", "name", "osm_id")

bad = []


def filter_passes(path):
    """`key` → values the prefilter lets through; None for any value."""
    passes = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            line = line.split("/", 1)[1] if "/" in line.split("=", 1)[0] else line
            key, _, values = line.partition("=")
            passes[key] = None if not values else set(values.split(","))
    return passes


def conditions(condition):
    """The plain tag maps inside an `__all__` or `__any__`, or the map itself."""
    if isinstance(condition, list):
        return [c for item in condition for c in conditions(item)]
    if not isinstance(condition, dict):
        return []
    nested = [c for k in ("__all__", "__any__") for c in conditions(condition.get(k))]
    plain = {k: v for k, v in condition.items() if not k.startswith("__")}
    return nested + ([plain] if plain else [])


def main():
    for path in (SCHEMA, FILTER, BUILD):
        if not os.path.exists(path):
            print(f"::error::{path} doesn't exist.")
            return 1
    with open(SCHEMA, encoding="utf-8") as f:
        schema = yaml.safe_load(f)
    with open(BUILD, encoding="utf-8") as f:
        build = f.read()
    passes = filter_passes(FILTER)
    layers = {v.get("id"): v.get("features") or [] for v in schema.get("layers") or []}

    if tuple(layers) != KINDS:
        bad.append(f"{SCHEMA}: layers are {list(layers)}, the app expects {list(KINDS)} in "
                   f"that order – a kind's switch would hide nothing.")
    for layer, features in layers.items():
        for i, b in enumerate(features, start=1):
            maps = conditions(b.get("include_when"))
            if not any(m.get("name") == "__any__" for m in maps):
                bad.append(f"{SCHEMA}: block {i} of `{layer}` takes unnamed objects – "
                           f"a names package draws nothing for them.")
            for m in maps:
                for key, values in m.items():
                    if key == "name":
                        continue
                    if key not in passes:
                        bad.append(f"{FILTER}: `{layer}` reads `{key}`, which the prefilter "
                                   f"drops – the run goes green and the kind is empty.")
                        continue
                    wanted = set(values) if isinstance(values, list) else None
                    allowed = passes[key]
                    if allowed is not None and (wanted is None or not wanted <= allowed):
                        missing = sorted((wanted or {"*"}) - allowed)
                        bad.append(f"{FILTER}: `{key}` lets through no {', '.join(missing)}, "
                                   f"which `{layer}` asks for.")
            attrs = {a.get("key") for a in b.get("attributes") or [] if isinstance(a, dict)}
            for key in EVERY_BLOCK:
                if key not in attrs:
                    bad.append(f"{SCHEMA}: block {i} of `{layer}` gives no `{key}`.")

    if " -R " in build or "--omit-referenced" in build:
        bad.append(f"{BUILD}: `osmium tags-filter -R` drops relation members – ranges and "
                   f"regions are multipolygons and would vanish.")
    if "region-cut.sh" not in build:
        bad.append(f"{BUILD}: the PBF isn't cut to the region (`workers/lib/region-cut.sh`), "
                   f"so far-off regions land in low-zoom tiles.")

    for b in bad:
        print(f"::error::{b}")
    if bad:
        print(f"\n{len(bad)} problem(s) in the geographical names layer.")
        return 1
    print("Geographical names: the prefilter passes every kind, each block is named, "
          "relation members stay.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
