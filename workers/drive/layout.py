#!/usr/bin/env python3
"""Where data lives on Drive: one root holding `cache/`, `countries/` and `mountains/`.

    <root>/cache/build/…                     the build cache (`cache.py`)
    <root>/cache/stores/<store>/…            stores of finished data (`store.py`)
    <root>/countries/<country id>/<region>/  packages the app downloads
    <root>/mountains/<range>/                mountain packages

`countries/` and `mountains/` are shared by link, the root and `cache/` are not.
`--migrate` moves the old folders there; it only moves and renames, so file ids –
the links in `maps.json` – stay.

    python3 workers/drive/layout.py --migrate [--dry-run] [--maps=maps.json]
"""
import argparse
import importlib.util
import json
import os
import sys
import urllib.parse

_HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, path):
    """workers/*.py can't be imported normally because of the dash in the name."""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


auth = load("drive_auth", "auth.py")
folder = load("drive_folder", "folder.py")

# the former map folder is the root; ids are no secret, the owner's token is
ROOT_ID = "1pvrw7CGUkQLwg8Ql8xbKA4HhQHvPl8_7"
# the former "Cache" folder, moved to `cache/build` with its id
BUILD_ID = "15-Z37buVADUk9_-RMWAQp6arqqjPdRaV"
CACHE, BUILD, STORES = "cache", "build", "stores"
COUNTRIES, MOUNTAINS = "countries", "mountains"
# where stores lay before: a folder in the token owner's My Drive root
OLD_STORES = "fricomaps-sklad"
SHARED = (COUNTRIES, MOUNTAINS)


def log(msg):
    print(msg, flush=True)


def package_parts(parts, country_id):
    """Catalog path → folder path under the root; the catalog keys stay as they are."""
    if parts and parts[0] == MOUNTAINS:
        return list(parts)
    return [COUNTRIES, country_id] + list(parts[1:])


def files_api(fid, tail=""):
    return f"/drive/v3/files/{urllib.parse.quote(fid)}{tail}"


def info(creds, fid):
    return auth.api_get(creds, files_api(fid, "?supportsAllDrives=true"
                                              "&fields=id,name,parents,owners(emailAddress)"))


def move(creds, fid, new_parent, name=None):
    """Into `new_parent` (renamed when `name`); the id and its links stay."""
    old = ",".join(info(creds, fid).get("parents") or [])
    q = (f"?supportsAllDrives=true&addParents={urllib.parse.quote(new_parent)}"
         + (f"&removeParents={urllib.parse.quote(old)}" if old else ""))
    auth.api_call(creds, "PATCH", files_api(fid, q), {"name": name} if name else {})


def link_permissions(creds, fid):
    data = auth.api_get(creds, files_api(fid, "/permissions?supportsAllDrives=true"
                                              "&fields=permissions(id,type,role)"))
    return [p for p in data.get("permissions") or [] if p.get("type") == "anyone"]


def share_by_link(creds, fid):
    """Anyone with the link reads it; the catalog's download links rely on that."""
    if not link_permissions(creds, fid):
        auth.api_call(creds, "POST", files_api(fid, "/permissions?supportsAllDrives=true"),
                      {"type": "anyone", "role": "reader"})


def unshare_link(creds, fid):
    for p in link_permissions(creds, fid):
        auth.api_call(creds, "DELETE", files_api(fid, f"/permissions/{p['id']}"
                                                      "?supportsAllDrives=true"))


def country_folder(creds, key, country_id, root=ROOT_ID):
    """`countries/<id>`, taking over the root's old `<key>` folder the first time."""
    countries = folder.ensure_folder(creds, root, COUNTRIES)
    fid = folder.find_folder(creds, countries, country_id)
    if fid:
        return fid
    old = folder.find_folder(creds, root, key)
    if old:
        move(creds, old, countries, country_id)
        log(f"    folder \"{key}\" moved to {COUNTRIES}/{country_id}")
        return old
    return folder.ensure_folder(creds, countries, country_id)


def package_folder(creds, parts, country_id, root=ROOT_ID):
    """The folder a build's packages go to, made when missing."""
    if parts and parts[0] == MOUNTAINS:
        return folder.ensure_path(creds, root, parts)
    return folder.ensure_path(creds, country_folder(creds, parts[0], country_id, root),
                              parts[1:])


def old_stores(creds):
    mine = auth.api_get(creds, "/drive/v3/files/root?fields=id")["id"]
    return folder.find_folder(creds, mine, OLD_STORES)


def stores_id(creds, create=False):
    """`cache/stores`, or the old folder until `--migrate` moved it."""
    cache = folder.find_folder(creds, ROOT_ID, CACHE)
    fid = folder.find_folder(creds, cache, STORES) if cache else None
    if fid:
        return fid
    old = old_stores(creds)
    if old or not create:
        return old
    return folder.ensure_folder(creds, folder.ensure_folder(creds, ROOT_ID, CACHE), STORES)


def countries_of(maps):
    """`{catalog key: id}` of the countries in `maps.json`."""
    return {k: v["id"] for k, v in maps.items()
            if not k.startswith(("_", "$")) and k != MOUNTAINS
            and isinstance(v, dict) and v.get("id")}


def plan(kids, countries):
    """`(moves, unknown)` from the root's names; `unknown` stops the migration."""
    names = set(kids.values())
    moves = [(k, i) for k, i in sorted(countries.items()) if k in names]
    known = {CACHE, COUNTRIES, MOUNTAINS} | set(countries)
    return moves, sorted(n for n in names if n not in known)


def migrate(creds, countries, dry_run=False):
    """Old layout → new; 0 = done or nothing to do, 1 = stopped, nothing changed."""
    root = info(creds, ROOT_ID)
    owner = ", ".join(o.get("emailAddress", "?") for o in root.get("owners") or [])
    log(f"Root: \"{root.get('name')}\" ({ROOT_ID}), owner {owner or '?'}")
    kids = folder.ids_in(creds, ROOT_ID)
    moves, unknown = plan(kids, countries)
    if unknown:
        # the root stops being shared, so whatever lies there would vanish for the app
        log(f"::error::The root holds what the layout doesn't know: {', '.join(unknown)}. "
            f"Move it into {COUNTRIES}/ or {MOUNTAINS}/ (or out of the root) and run again; "
            f"nothing was changed.")
        return 1
    build = info(creds, BUILD_ID)
    cache = folder.find_folder(creds, ROOT_ID, CACHE)
    old = old_stores(creds)
    new = folder.find_folder(creds, cache, STORES) if cache else None
    steps = [f"move {k}/ → {COUNTRIES}/{i}/" for k, i in moves]
    steps += [f"share {d}/ by link" for d in SHARED]
    steps += ["stop sharing the root by link" if link_permissions(creds, ROOT_ID)
              else "the root isn't shared by link ✓"]
    if not cache or cache not in (build.get("parents") or []):
        steps.append(f"move \"{build.get('name')}\" → {CACHE}/{BUILD}/")
    if old and new:
        log(f"::warning::Both \"{OLD_STORES}\" in My Drive and {CACHE}/{STORES} exist – "
            f"merge them by hand; the stores read {CACHE}/{STORES}.")
    elif old:
        steps.append(f"move My Drive/{OLD_STORES} → {CACHE}/{STORES}/")
    for s in steps:
        log(f"  {s}")
    if dry_run:
        log("Listing only, nothing changed.")
        return 0

    for key, cid in moves:
        country_folder(creds, key, cid)
    for d in SHARED:
        share_by_link(creds, folder.ensure_folder(creds, ROOT_ID, d))
    unshare_link(creds, ROOT_ID)
    if link_permissions(creds, ROOT_ID):
        # inherited from a parent folder: the cache would be public under it
        log("::error::The root is still shared by link (from a folder above it?) – "
            "the cache and stores stay where they are.")
        return 1
    cache = folder.ensure_folder(creds, ROOT_ID, CACHE)
    if cache not in (build.get("parents") or []):
        move(creds, BUILD_ID, cache, BUILD)
    if old and not new:
        move(creds, old, cache, STORES)
    log("Done.")
    return 0


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--migrate", action="store_true", required=True)
    ap.add_argument("--dry-run", action="store_true", help="only print the steps")
    ap.add_argument("--maps", default="maps.json", help="the catalog naming the countries")
    args = ap.parse_args()
    creds = auth.from_env()
    if creds is None:
        print("::error::Moving folders on Drive needs the owner's token (GDRIVE_CREDENTIALS "
              "or DRIVE_CLIENT / DRIVE_SECRET / DRIVE_REFRESH).")
        return 1
    with open(args.maps) as f:
        countries = countries_of(json.load(f))
    try:
        return migrate(creds, countries, args.dry_run)
    except auth.AuthError as exc:
        print(f"::error::{exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
