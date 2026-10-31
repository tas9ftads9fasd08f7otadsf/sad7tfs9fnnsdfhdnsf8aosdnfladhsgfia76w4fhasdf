"""The one reader of `workers/data/map-settings.json`: settings, sources and their authors."""
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
