#!/usr/bin/env python3
"""Rail: the filter passes what the schema wants, routing runs on what the map draws; no lifts."""
import json
import os
import sys

import yaml

_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKERS = os.path.dirname(_HERE)
SCHEMA = os.path.join(_WORKERS, "rail", "rail.yml")
FILTER = os.path.join(_WORKERS, "rail", "filter.txt")
BUILD = os.path.join(_WORKERS, "rail", "build.sh")
ROUTING = os.path.join(os.path.dirname(_WORKERS), "config", "routing.json")
DICTIONARY = "config/routing.json (`rail_tags`)"

# keys `lines.py` adds to points – the prefilter needn't pass them
DERIVED = {"rail_speed"}

# what the package promises in the app
PROMISED = {"rail", "tram", "subway", "light_rail", "abandoned", "disused",
         "station", "halt", "level_crossing"}


def filter_keys(path):
    out = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            if "/" in line.split("=", 1)[0]:
                line = line.split("/", 1)[1]
            out.add(line.split("=", 1)[0].strip())
    return out


def conditions(when):
    """Key → values pairs of `include_when`, also under `__all__`."""
    if not when:
        return []
    if "__all__" in when:
        return [p for c in when["__all__"] for p in conditions(c)]
    return [(k, v if isinstance(v, list) else [v]) for k, v in when.items()]


def main():
    bad = []
    with open(SCHEMA, encoding="utf-8") as f:
        schema = yaml.safe_load(f)
    blocks = [b for v in schema.get("layers") or [] for b in v.get("features") or []]

    passes, classes, aerial = filter_keys(FILTER), set(), set()
    for b in blocks:
        keys = set()
        for key, values in conditions(b.get("include_when")):
            keys.add(key)
            if key == "railway":
                classes |= set(map(str, values))
            if key == "aerialway":
                aerial |= set(map(str, values))
        # under `__all__` one key is enough – the rest come with the same object
        if keys and not keys & (passes | DERIVED):
            bad.append(f"{FILTER}: the schema asks for {', '.join(sorted(keys))}, "
                       f"the prefilter doesn't pass it – tiles would be made without it.")

    for promise in sorted(PROMISED - classes):
        bad.append(f"{SCHEMA}: `railway={promise}` isn't in the schema, yet the "
                   f"package promises it.")

    # lifts and cable cars are Ski & winter's, the ones out of service Army & history's
    if aerial or "aerialway" in passes:
        bad.append(f"{SCHEMA}: aerialways are back in railways – they are Ski & winter's.")

    with open(ROUTING, encoding="utf-8") as f:
        network = set(json.load(f)["rail_tags"]["network"]["railway"])
    for cls in sorted(network - classes):
        bad.append(f"{DICTIONARY}: routing runs on `railway={cls}`, which the map "
                   f"doesn't draw – a route would run off the drawing.")

    with open(BUILD, encoding="utf-8") as f:
        build = f.read()
    if "--dictionary=rail" not in build:
        bad.append(f"{BUILD}: the rail network isn't built with its own dictionary – "
                   f"with the road one it would hold not a single line.")
    if " -R" in build or "--omit-referenced" in build:
        bad.append(f"{BUILD}: `-R` drops relation members – station areas vanish.")
    if "signs.mjs" not in build:
        bad.append(f"{BUILD}: country signs aren't baked – the app would draw the defaults.")
    with open(os.path.join(os.path.dirname(_WORKERS), "config", "packages.json"), encoding="utf-8") as f:
        rail = [p for p in json.load(f)["packages"] if p["key"] == "railways"]
    if not rail or "rail_signs" not in (rail[0].get("manifest") or []):
        bad.append("config/packages.json: `railways` doesn't carry `rail_signs` – "
                   "the signs wouldn't reach the package.")

    for b in bad:
        print(f"::error::{b}")
    if not bad:
        print(f"rail ✓ ({len(blocks)} blocks, {len(classes)} classes, "
              f"network of {len(network)} classes)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
