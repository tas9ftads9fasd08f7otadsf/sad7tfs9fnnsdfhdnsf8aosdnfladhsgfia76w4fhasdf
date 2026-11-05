#!/usr/bin/env python3
"""The package catalog: one owner per OSM tag, shared tags declared, the base map's share consistent."""
import json
import os
import sys
from collections import defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))
CATALOG = os.path.join(_ROOT, "workers", "data", "packages.json")


def atoms(tag):
    """`("key", None)` for a whole key, `("key", "a"), ("key", "b")` for `key=a,b`."""
    key, _, values = tag.partition("=")
    return [(key, None)] if not values else [(key, v) for v in values.split(",")]


def filter_keys(path):
    """Keys an `osmium tags-filter --expressions` file lets through."""
    keys = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            if "/" in line.split("=", 1)[0]:
                line = line.split("/", 1)[1]
            keys.add(line.split("=", 1)[0])
    return keys


def claims(catalog):
    """`{atom: {package}}` of every package's `owns`."""
    found = defaultdict(set)
    for package in catalog["packages"]:
        for tag in package.get("owns") or []:
            for atom in atoms(tag):
                found[atom].add(package["key"])
    return found


def claimed_by(catalog, package, atom):
    """Whether `package` owns `atom`, by its value or by the whole key."""
    own = {a for p in catalog["packages"] if p["key"] == package for t in p.get("owns") or [] for a in atoms(t)}
    return atom in own or (atom[0], None) in own


def problems(catalog, root=_ROOT):
    bad = []
    keys = [p["key"] for p in catalog["packages"]]
    base = catalog.get("base_map") or {}
    shares = set((base.get("layers") or {}).values())
    for rule in (base.get("split") or {}).values():
        shares |= set(rule["to"].values()) | {rule["else"]}
    for package in sorted(shares - set(keys)):
        bad.append(f"`base_map` gives layers to `{package}`, which is no package.")
    for p in catalog["packages"]:
        cut = f"omt_{p['key']}"
        if p["key"] in shares and cut not in (p.get("manifest") or []):
            bad.append(f"`{p['key']}` carries a share of the base map, but its `manifest` lacks `{cut}`.")
        if cut in (p.get("manifest") or []) and p["key"] not in shares:
            bad.append(f"`{p['key']}` lists `{cut}`, but `base_map` gives it no layer.")

    shared = catalog.get("shared") or []
    for entry in shared:
        for package in entry["packages"]:
            if package not in keys:
                bad.append(f"`shared` {entry['tag']}: `{package}` is no package.")
            elif not all(claimed_by(catalog, package, a) for a in atoms(entry["tag"])):
                bad.append(f"`shared` {entry['tag']}: `{package}` doesn't own it in `owns`.")
        if entry.get("owner") not in entry["packages"]:
            bad.append(f"`shared` {entry['tag']}: the owner `{entry.get('owner')}` isn't one of its packages.")
        if not entry.get("why"):
            bad.append(f"`shared` {entry['tag']}: says no `why`.")
    for atom, owners in sorted(claims(catalog).items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
        if len(owners) < 2:
            continue
        covered = any(atom in atoms(e["tag"]) and owners <= set(e["packages"]) for e in shared)
        if not covered:
            tag = atom[0] + (f"={atom[1]}" if atom[1] else "")
            bad.append(f"`{tag}` is owned by {', '.join(sorted(owners))}; one owner, or a `shared` entry.")

    for p in catalog["packages"]:
        reads = p.get("reads") or []
        passes = set()
        for path in reads:
            if not os.path.exists(os.path.join(root, path)):
                bad.append(f"`{p['key']}` reads `{path}`, which doesn't exist.")
            else:
                passes |= filter_keys(os.path.join(root, path))
        # a base map share owns what OpenMapTiles took in; no prefilter of ours says it
        if not reads or p["key"] in shares:
            continue
        for tag in p.get("owns") or []:
            if tag.split("=", 1)[0] not in passes:
                bad.append(f"`{p['key']}` owns `{tag}`, but none of its `reads` lets that key through.")
    return bad


def main():
    with open(CATALOG, encoding="utf-8") as f:
        catalog = json.load(f)
    bad = problems(catalog)
    for b in bad:
        print(f"::error file={os.path.relpath(CATALOG, _ROOT)}::{b}")
    if bad:
        print(f"\n{len(bad)} problem(s) in the package catalog.")
        return 1
    print(f"Package catalog: {sum(1 for p in catalog['packages'] if p.get('owns'))} packages own their tags, "
          f"{len(catalog.get('shared') or [])} shared tags are declared, the base map's share adds up.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
