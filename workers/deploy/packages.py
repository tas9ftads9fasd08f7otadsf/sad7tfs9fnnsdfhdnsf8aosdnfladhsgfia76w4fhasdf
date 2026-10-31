#!/usr/bin/env python3
"""Package list access – the one answer to "what gets published" (`workers/data/packages.json`)."""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA = os.path.join(os.path.dirname(_HERE), "data")
REGISTRY = os.path.join(_DATA, "packages.json")
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "lib"))
import map_settings  # noqa: E402

# maps are built from DMR 5.0 unless the region names another model
DEFAULT_MODEL = "dmr5"
# a manifest from before ranges named their photo source had only this one
DEFAULT_AERIAL = "ofmozaika_sk"
# a package's source kind → the settings' sources it is picked from
KINDS = {"dem": ("contours", "rocks", "shading"), "aerial": ("summer", "winter")}

_CACHE = None


def _read():
    global _CACHE
    if _CACHE is None:
        with open(REGISTRY, encoding="utf-8") as f:
            _CACHE = json.load(f)
    return _CACHE


def listing():
    """Packages in file order – the order people see them in."""
    return list(_read().get("packages") or [])


def keys():
    return [p["key"] for p in listing()]


def package(key):
    for p in listing():
        if p["key"] == key:
            return p
    raise SystemExit(f"::error::Package `{key}` is not in {os.path.relpath(REGISTRY)}. "
                     f"It has: {', '.join(keys())}.")


def retired():
    """Stems nobody builds any more, former names too – their old file on Drive is deleted."""
    return tuple(s for r in _read().get("retired") or ()
                 for s in [r["key"], *(r.get("legacy") or ())])


def legacy():
    """`{former key: key}` for packages renamed since, retired ones too."""
    every = listing() + list(_read().get("retired") or ())
    return {old: p["key"] for p in every for old in p.get("legacy") or ()}


def regenerable():
    """`{regenerate key: package}` – what builds without the whole map."""
    return {p["regenerate"]: p for p in listing() if p.get("regenerate")}


def for_catalog():
    """Name, mark and line of every package for `maps.json`."""
    return {p["key"]: {"app": p["app"], "symbol": p["symbol"],
                       "detail": p["app_detail"], "description": p["description"],
                       **({"part_of": p["part_of"]} if p.get("part_of") else {})}
            for p in listing()}


def subpackages(key):
    """Keys of packages that are part of `key`, in file order."""
    return [p["key"] for p in listing() if p.get("part_of") == key]


def source_credits(kind, use, models, settings):
    """Credit keys of the source the map used for `dem:<use>` or `aerial:<use>`."""
    known = map_settings.sources(kind, settings=settings)
    picked = models.get(use if kind == "dem" else f"aerial_{use}")
    if picked not in known:
        picked = DEFAULT_MODEL if kind == "dem" else DEFAULT_AERIAL
    return (known.get(picked) or {}).get("credits") or []


def credits(key, models=None, settings=None):
    """Data authors of a package; `models` = what the map used, `{contours: dmr5, aerial_summer: …}`."""
    settings = map_settings.load() if settings is None else settings
    authors = map_settings.credits(settings=settings)
    models = models or {}
    out = []
    for source in package(key).get("sources") or ():
        kind, _, use = source.partition(":")
        names = source_credits(kind, use, models, settings) if kind in KINDS else [source]
        for name in names:
            credit = authors.get(name)
            if credit and credit not in out:
                out.append(dict(credit))
    return out


def main():
    """`python3 workers/deploy/packages.py [--keys|--regenerate]` – for a look."""
    if "--keys" in sys.argv:
        print("\n".join(keys()))
    elif "--regenerate" in sys.argv:
        print("\n".join(regenerable()))
    else:
        for p in listing():
            print(f"{p['key']:<18} {p['app']:<22} {p['symbol']:<32} {p['description']}")


if __name__ == "__main__":
    main()
