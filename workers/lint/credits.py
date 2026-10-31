#!/usr/bin/env python3
"""Check: every package names its data authors and the catalog writes them."""
import importlib.util
import json
import sys

sys.path.insert(0, "workers/lib")
import map_settings  # noqa: E402

CREDITS = f"`credits` of {map_settings.NAME}"
PACKAGES = "workers/data/packages.json"
KEYS = {"holder", "work", "license", "license_url", "source_url", "changes",
        "copyright"}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def main():
    bad = []
    settings = map_settings.load()
    credits = map_settings.credits(settings=settings)
    with open(PACKAGES, encoding="utf-8") as f:
        packages = json.load(f)["packages"]
    packages_mod = load("deploy_packages", "workers/deploy/packages.py")

    for key, credit in credits.items():
        if not credit.get("holder"):
            bad.append(f"{CREDITS}: `{key}` has no `holder`")
        if set(credit) - KEYS:
            bad.append(f"{CREDITS}: `{key}` has unknown keys "
                       f"{sorted(set(credit) - KEYS)} – the app doesn't read them")
        if "copyright" in credit and not isinstance(credit["copyright"], bool):
            bad.append(f"{CREDITS}: `{key}` – `copyright` must be true/false")

    # every source a map can pick names its authors, and they are known
    for kind in packages_mod.KINDS:
        for key, src in map_settings.sources(kind, settings=settings).items():
            if not src.get("credits"):
                bad.append(f"`sources.{kind}.{key}` names no `credits` – its maps would "
                           f"go out without an author")
            for name in src.get("credits") or []:
                if name not in credits:
                    bad.append(f"`sources.{kind}.{key}` credits `{name}`, which isn't in {CREDITS}")

    for p in packages:
        sources = p.get("sources")
        if not sources:
            bad.append(f"{PACKAGES}: package `{p['key']}` has no `sources`")
            continue
        # the author of the computation states the change to the height model (CC BY)
        dem = [i for i, s in enumerate(sources) if s.startswith("dem:")]
        if dem and (sources[0] != "author" or min(dem) == 0):
            bad.append(f"{PACKAGES}: `{p['key']}` – `author` must come before `dem:*`")
        for s in sources:
            kind, sep, use = s.partition(":")
            if sep:
                uses = packages_mod.KINDS.get(kind, ())
                if use not in uses:
                    known = [f"{k}:{u}" for k, us in packages_mod.KINDS.items() for u in us]
                    bad.append(f"{PACKAGES}: `{p['key']}` – `{s}` is not one of "
                               f"{', '.join(known)}")
            elif s not in credits:
                bad.append(f"{PACKAGES}: `{p['key']}` – source `{s}` isn't in {CREDITS}")

    # the author of the computation comes before the data computed from
    relief = [credits.get("author"), credits.get("dmr5")]
    if packages_mod.credits("terrain", {"shading": "dmr5"}) != relief:
        bad.append("packages.credits: terrain doesn't name the author, then ÚGKK SR")
    if packages_mod.credits("contours", {}) != relief:
        bad.append("packages.credits: a region without a model doesn't name the author "
                   "and the default DMR 5.0")
    if packages_mod.credits("base") != [credits.get("osm")]:
        bad.append("packages.credits: the base map doesn't name OpenStreetMap")
    photos = [credits.get("ortofoto"), credits.get("freemap")]
    if packages_mod.credits("aerial_summer", {"aerial_summer": "ofmozaika_sk"}) != photos:
        bad.append("packages.credits: summer photos from ofmozaika_sk don't name its authors")

    catalog = open("workers/deploy/catalog.py", encoding="utf-8").read()
    if catalog.count("models=region_models(man, reg)") < 2:
        bad.append("workers/deploy/catalog.py: some package write doesn't pass "
                   "`region_models` – height authors would be defaults, not the real ones")

    for b in bad:
        print(f"::error::{b}")
    if bad:
        sys.exit(1)
    print(f"✔ {len(packages)} packages, each with data authors")


if __name__ == "__main__":
    main()
