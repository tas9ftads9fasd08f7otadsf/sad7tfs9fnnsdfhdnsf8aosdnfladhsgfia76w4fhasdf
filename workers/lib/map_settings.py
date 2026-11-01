"""The one reader of `workers/data/map-settings.json`: settings, places, sources and their authors."""
import json
import os

NAME = "workers/data/map-settings.json"
PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data",
                    "map-settings.json")


def load(path=None):
    with open(path or PATH, encoding="utf-8") as f:
        return json.load(f)


def plain(entries):
    """Entries without the `_comment` keys."""
    return {k: v for k, v in (entries or {}).items() if not k.startswith("_")}


def sources(kind, path=None, settings=None):
    """`sources.<kind>` by key – `dem` for height models, `aerial` for photos."""
    settings = load(path) if settings is None else settings
    return plain((settings.get("sources") or {}).get(kind))


def dem_sources(path=None, settings=None):
    return sources("dem", path, settings)


def aerial_sources(path=None, settings=None):
    return sources("aerial", path, settings)


def credits(path=None, settings=None):
    """Data authors by key, in the shape the app reads (`LayerCredit`)."""
    settings = load(path) if settings is None else settings
    return plain(settings.get("credits"))


def regions(path=None, settings=None):
    """Every map's place by key: name, bbox, osm.fr extract, country."""
    settings = load(path) if settings is None else settings
    return settings.get("regions") or {}


def areas(path=None, settings=None):
    """Named cut-outs by key, `_comment` included."""
    settings = load(path) if settings is None else settings
    return settings.get("areas") or {}


def mountains(path=None, settings=None):
    """A range's cut-out, countries and OSM extracts by key – its `settings` left out."""
    settings = load(path) if settings is None else settings
    ranges = (((settings.get("maps") or {}).get("mountains") or {}).get("ranges")) or {}
    return {k: {f: v for f, v in e.items() if f != "settings"} for k, e in plain(ranges).items()}
