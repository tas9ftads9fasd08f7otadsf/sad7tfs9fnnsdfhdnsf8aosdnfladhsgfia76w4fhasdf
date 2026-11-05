#!/usr/bin/env python3
"""Cut the base map's OpenMapTiles archive into one `-omt-<package>.pmtiles` per package."""
import argparse
import gzip
import importlib.util
import json
import os
import sys

_spec = importlib.util.spec_from_file_location(
    "drop_layer", os.path.join(os.path.dirname(os.path.abspath(__file__)), "drop-layer.py"))
drop = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(drop)

_CATALOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "packages.json")
with open(_CATALOG, encoding="utf-8") as _f:
    BASE_MAP = json.load(_f)["base_map"]
# a whole layer to one package; the app's `MapOverlay.claimant` says the same
LAYERS = BASE_MAP["layers"]
# these layers are shared, so each feature goes by a tag
SPLIT = BASE_MAP["split"]
PACKAGES = tuple(dict.fromkeys(list(LAYERS.values())
                               + [p for rule in SPLIT.values() for p in [*rule["to"].values(), rule["else"]]]))


def stem(package):
    return f"-omt-{package}.pmtiles"


def manifest_key(package):
    return f"omt_{package}"


def owner(layer, tags):
    """The package of a feature of `layer` with `tags`."""
    rule = SPLIT.get(layer)
    if rule:
        return rule["to"].get(tags.get(rule["tag"]), rule["else"])
    return LAYERS.get(layer)


def fields(body):
    """`[(field, wire, start, end, value start)]` of one protobuf message."""
    out = []
    i = 0
    while i < len(body):
        start = i
        key, i = drop.varint(body, i)
        end = drop.skip(body, i, key & 7)
        out.append((key >> 3, key & 7, start, end, i))
        i = end
    return out


def payload(body, value_at):
    n, j = drop.varint(body, value_at)
    return body[j:j + n]


def string_value(value):
    """A `Value` message's string, or None for a number or bool."""
    for field, wire, _s, _e, at in fields(value):
        if field == 1 and wire == 2:
            return payload(value, at).decode()
    return None


def feature_tags(feature, keys, values):
    tags = {}
    for field, wire, _s, _e, at in fields(feature):
        if field == 2 and wire == 2:
            packed = payload(feature, at)
            i, ids = 0, []
            while i < len(packed):
                v, i = drop.varint(packed, i)
                ids.append(v)
            for k, v in zip(ids[::2], ids[1::2]):
                if k < len(keys) and v < len(values):
                    tags[keys[k]] = values[v]
    return tags


def split_layer(body):
    """`{package: layer bytes}` of one shared layer, its key and value tables kept."""
    parts = fields(body)
    keys = [payload(body, at).decode() for f, w, _s, _e, at in parts if f == 3 and w == 2]
    values = [string_value(payload(body, at)) for f, w, _s, _e, at in parts if f == 4 and w == 2]
    name = drop.layer_name(body)
    head, features = bytearray(), {}
    for field, _w, start, end, at in parts:
        if field == 2:
            package = owner(name, feature_tags(payload(body, at), keys, values))
            features.setdefault(package, bytearray()).extend(body[start:end])
        else:
            head += body[start:end]
    return {p: bytes(head + f) for p, f in features.items()}


def wrap(layer):
    """A layer as tile field 3."""
    out, n = bytearray([3 << 3 | 2]), len(layer)
    while n >= 0x80:
        out.append(n & 0x7F | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out) + layer


def cut_tile(raw):
    """`{package: tile bytes}`; an unknown layer stops the cut, nothing may fall out."""
    out = {}
    for field, _w, start, end, at in fields(raw):
        if field != 3:
            continue
        body = payload(raw, at)
        name = drop.layer_name(body)
        if name in SPLIT:
            for package, layer in split_layer(body).items():
                out.setdefault(package, bytearray()).extend(wrap(layer))
        elif name in LAYERS:
            out.setdefault(LAYERS[name], bytearray()).extend(raw[start:end])
        else:
            raise SystemExit(f"::error::Layer `{name}` of the base map belongs to no "
                             f"package – add it to `base_map` in {_CATALOG}.")
    return {p: bytes(t) for p, t in out.items()}


def layer_names(raw):
    return {drop.layer_name(payload(raw, at)) for f, _w, _s, _e, at in fields(raw) if f == 3}


def cut(src, out_prefix):
    """`{package: path}` of the archives written."""
    from pmtiles.reader import MmapSource, Reader, all_tiles
    from pmtiles.tile import Compression, zxy_to_tileid
    from pmtiles.writer import Writer

    with open(src, "rb") as f:
        r = Reader(MmapSource(f))
        header, metadata = r.header(), r.metadata()
        gz = header["tile_compression"] == Compression.GZIP
        tiles = {p: [] for p in PACKAGES}
        names = {p: set() for p in PACKAGES}
        for (z, x, y), data in all_tiles(r.get_bytes):
            for package, raw in cut_tile(gzip.decompress(data) if gz else data).items():
                names[package].update(layer_names(raw))
                # mtime=0, or equal tiles hash apart and lose deduplication
                tiles[package].append((zxy_to_tileid(z, x, y),
                                       gzip.compress(raw, 9, mtime=0) if gz else raw))
    every = metadata.get("vector_layers") or []
    written = {}
    for package in PACKAGES:
        dst = out_prefix + stem(package)
        meta = dict(metadata, vector_layers=[v for v in every if v.get("id") in names[package]])
        with open(dst + ".tmp", "wb") as f:
            w = Writer(f)
            for tid, data in sorted(tiles[package], key=lambda t: t[0]):
                w.write_tile(tid, data)
            w.finalize(dict(header), meta)
        os.replace(dst + ".tmp", dst)
        written[package] = dst
        print(f"{dst}: {len(tiles[package])} tiles, {os.path.getsize(dst) / 1048576:.1f} MB")
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="_site")
    args = ap.parse_args()
    path = os.path.join(args.site, "tiles", "manifest.json")
    with open(path, encoding="utf-8") as f:
        man = json.load(f)
    key = man["default_region"]
    region = man["regions"][key]
    src = os.path.join(args.site, region["pmtiles"])
    written = cut(src, os.path.join(args.site, "tiles", key))
    for package, dst in written.items():
        region[manifest_key(package)] = os.path.relpath(dst, args.site).replace(os.sep, "/")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
