#!/usr/bin/env python3
"""`workers/data/map-settings.json` resolves for every map a form can build, and no form goes around it."""
import importlib.util
import json
import os
import sys

import yaml

SETTINGS = "workers/data/map-settings.json"
OPTIONS_PY = "workers/plan/options.py"
REGIONS = "workers/data/regions.json"
MOUNTAINS = "workers/data/mountains.json"
REGION_WF = ".github/workflows/build-map-region.yml"
MOUNTAIN_WF = ".github/workflows/mountain.yml"
STATE_WF = ".github/workflows/build-map-state.yml"
# the forms that build from the settings; what they may still ask
FORMS = {
    REGION_WF: {"region", "area", "test", "rebuild", "publish_pages"},
    ".github/workflows/regenerate-region.yml": {"region", "what", "test"},
    STATE_WF: {"country", "test", "rebuild", "continuation"},
    ".github/workflows/regenerate-state.yml": {"country", "what", "test", "continuation"},
    MOUNTAIN_WF: {"mountain", "test", "rebuild"},
}
SEASONS = ("summer", "winter")
REGION_LEVEL = 4

bad = 0


def error(path, text):
    global bad
    bad += 1
    print(f"::error file={path}::{text}")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def form(path):
    with open(path, encoding="utf-8") as f:
        d = yaml.safe_load(f)
    on = d[[k for k in d if k is True or k == "on"][0]]
    return (on.get("workflow_dispatch") or {}).get("inputs") or {}


spec = importlib.util.spec_from_file_location("plan_options", OPTIONS_PY)
opts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(opts)

settings = load(SETTINGS)
regions = load(REGIONS)
ranges_known = [k for k in load(MOUNTAINS) if not k.startswith("_")]
dem = {k: v.get("for", []) for k, v in
       ((settings.get("sources") or {}).get("dem") or {}).items() if not k.startswith("_")}
credits = {k for k in settings.get("credits") or {} if not k.startswith("_")}
maps = settings.get("maps") or {}
aerial = (settings.get("sources") or {}).get("aerial") or {}

# 1. defaults name every setting there is, and nothing else
defaults = settings.get("defaults") or {}
for k in sorted(set(opts.DESCRIPTIONS) - set(defaults)):
    error(SETTINGS, f"`defaults` lacks `{k}` – {OPTIONS_PY} knows it, so every map needs a value.")
for k in sorted(set(defaults) - set(opts.DESCRIPTIONS)):
    error(SETTINGS, f"`defaults.{k}` isn't a setting {OPTIONS_PY} knows – nobody reads it.")

# 2. every level is a real place
for key, node in maps.items():
    if key == opts.MOUNTAINS:
        if key in regions:
            error(REGIONS, f"`{key}` is a region key, but it is the mountain category in {SETTINGS}.")
        for r in node.get("ranges") or {}:
            if r not in ranges_known:
                error(SETTINGS, f"Range `{r}` isn't in {MOUNTAINS}.")
        for r in ranges_known:
            if r not in (node.get("ranges") or {}):
                error(SETTINGS, f"Range `{r}` of {MOUNTAINS} has no entry in `maps.mountains.ranges`.")
        continue
    if key not in regions or (regions[key].get("country") or key) != key:
        error(SETTINGS, f"`maps.{key}` isn't a country of {REGIONS}.")
        continue
    for r in node.get("regions") or {}:
        if r not in regions or regions[r].get("country") != key or r == key:
            error(SETTINGS, f"`maps.{key}.regions.{r}` isn't a region of {key} in {REGIONS}.")

# 3. a country a form builds has its own entry, or it quietly gets Slovakia's model
built = set(form(STATE_WF).get("country", {}).get("options") or [])
built |= {regions[r].get("country") or r for r in form(REGION_WF).get("region", {}).get("options") or []
          if r in regions}
for country in sorted(built - set(maps)):
    error(SETTINGS, f"Country `{country}` is built by a form but has no `maps.{country}` – "
                    f"say what model covers it, even if it is `none`.")

# 4. every source a level picks exists and fits its layer
allowed = {
    "contour_source": [opts.NONE] + [k for k, f in dem.items() if "contours" in f],
    "rock_source": [opts.NONE, opts.ROCK_FROM_SHADING] + [k for k, f in dem.items() if "rocks" in f],
    "shading_source": [opts.NONE] + [k for k, f in dem.items() if "shading" in f],
}
for key, src in aerial.items():
    if src.get("season") not in SEASONS:
        error(SETTINGS, f"Aerial source `{key}` has season {src.get('season')!r}, not one of {SEASONS}.")
    if not src.get("url"):
        error(SETTINGS, f"Aerial source `{key}` has no `url`.")
    if not src.get("credits"):
        error(SETTINGS, f"Aerial source `{key}` names no `credits` – the photos' authors.")
    for c in src.get("credits") or []:
        if c not in credits:
            error(SETTINGS, f"Aerial source `{key}` credits `{c}`, which isn't in `credits`.")


def check_level(where, part):
    for k, v in part.items():
        if k in allowed and v not in allowed[k]:
            error(SETTINGS, f"`{where}`: `{k}: {v}` – known: {', '.join(allowed[k])}.")
        season = k.removeprefix("aerial_")
        if season in SEASONS and v and (v not in aerial or aerial[v].get("season") != season):
            error(SETTINGS, f"`{where}`: `{k}: {v}` isn't a {season} source of `sources.aerial`.")


check_level("defaults", defaults)
for key, node in maps.items():
    check_level(f"maps.{key}", node.get("settings") or {})
    for sub, entry in {**(node.get("regions") or {}), **(node.get("ranges") or {})}.items():
        check_level(f"maps.{key}.{sub}", entry.get("settings") or {})

# 5. every map a form offers resolves
for r in form(REGION_WF).get("region", {}).get("options") or []:
    try:
        opts.resolve(settings, regions, region=r)
    except opts.SettingsError as exc:
        error(SETTINGS, f"Region `{r}`: {exc}")
offered = form(MOUNTAIN_WF).get("mountain", {}).get("options") or []
if sorted(offered) != sorted(ranges_known):
    error(MOUNTAIN_WF, f"The `mountain` choice is {offered}, {MOUNTAINS} has {ranges_known}.")
for r in ranges_known:
    try:
        opts.resolve(settings, regions, mountain=r)
    except opts.SettingsError as exc:
        error(SETTINGS, f"Range `{r}`: {exc}")

# 6. a form asks what to build, never a setting – or the run and the file disagree
for path, may in FORMS.items():
    for name in form(path):
        if name not in may:
            error(path, f"Input `{name}`: a setting goes into {SETTINGS}, not the form "
                        f"(it may ask {', '.join(sorted(may))}).")

print(f"map settings: {bad} errors ({len(maps)} categories, {len(ranges_known)} ranges, "
      f"{len(aerial)} aerial sources)")
sys.exit(1 if bad else 0)
