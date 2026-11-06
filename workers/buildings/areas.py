#!/usr/bin/env python3
"""Writes `area_m2` onto buildings and places, `in_town` onto houses in built-up land; a twin place keeps its point."""
import argparse
import math
import os
import sys
from pathlib import Path

import osmium

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from place_twins import bbox, twins  # noqa: E402

R = 6371008.8


def ring_area(points):
    """Ring area in m² – planetiler can't compute it in the schema."""
    if len(points) < 4:
        return 0.0
    lat0 = math.radians(sum(b[1] for b in points) / len(points))
    xy = [(math.radians(x) * R * math.cos(lat0), math.radians(y) * R) for x, y in points]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(xy, xy[1:]))) / 2


def points(ring):
    return [(n.lon, n.lat) for n in ring if n.location.valid()]


TOWN = {"residential", "commercial", "retail"}
CELL = 0.01
STRIP = 0.0005


class Ring:
    """A ring's edges bucketed by latitude, so a ray cast reads only those near the point."""

    def __init__(self, points):
        self.strips = {}
        for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
            if y1 == y2:
                continue
            for k in range(int(min(y1, y2) // STRIP), int(max(y1, y2) // STRIP) + 1):
                self.strips.setdefault(k, []).append((x1, y1, x2, y2))

    def holds(self, x, y):
        hit = False
        for x1, y1, x2, y2 in self.strips.get(int(y // STRIP), ()):
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
        return hit


class Towns:
    """Built-up land in a grid, to ask which houses stand in it."""

    def __init__(self):
        self.grid = {}

    def add(self, outer, inners):
        xs, ys = [p[0] for p in outer], [p[1] for p in outer]
        shape = (Ring(outer), [Ring(i) for i in inners if len(i) > 3])
        for cx in range(int(min(xs) // CELL), int(max(xs) // CELL) + 1):
            for cy in range(int(min(ys) // CELL), int(max(ys) // CELL) + 1):
                self.grid.setdefault((cx, cy), []).append(shape)

    def holds(self, x, y):
        for outer, inners in self.grid.get((int(x // CELL), int(y // CELL)), ()):
            if outer.holds(x, y) and not any(i.holds(x, y) for i in inners):
                return True
        return False


class Areas(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}
        self.relations = {}
        self.place_nodes = []
        self.place_areas = []
        self.towns = Towns()
        self.centres = {}

    def node(self, n):
        if "place" in n.tags and n.location.valid():
            self.place_nodes.append((n.id, n.tags.get("name"), n.tags.get("wikidata"),
                                     n.location.lon, n.location.lat))

    def area(self, a):
        t = a.tags
        if t.get("landuse") in TOWN:
            for outer in a.outer_rings():
                ring = points(outer)
                if len(ring) > 3:
                    self.towns.add(ring, [points(i) for i in a.inner_rings(outer)])
        if "building" not in t and "place" not in t:
            return
        m2 = 0.0
        ring = []
        for outer in a.outer_rings():
            ring += points(outer)
            m2 += ring_area(points(outer))
            for inner in a.inner_rings(outer):
                m2 -= ring_area(points(inner))
        if m2 <= 0:
            return
        key = ("w" if a.from_way() else "r", a.orig_id())
        (self.ways if a.from_way() else self.relations)[key[1]] = round(m2)
        if "building" in t and ring:
            self.centres[key] = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
        if "place" in t and ring:
            self.place_areas.append((key, t.get("name"), t.get("wikidata"), bbox(ring)))

    def in_town(self):
        """Buildings whose centre stands in built-up land."""
        return {key for key, (x, y) in self.centres.items() if self.towns.holds(x, y)}

    def twins(self):
        """Place areas that have a place point, and the area each point takes over."""
        pairs = twins(self.place_nodes, self.place_areas)
        node_m2 = {}
        for (kind, i), node in pairs.items():
            m2 = (self.ways if kind == "w" else self.relations)[i]
            node_m2[node] = max(node_m2.get(node, 0), m2)
        return set(pairs), node_m2


class Write(osmium.SimpleHandler):
    def __init__(self, areas, writer):
        super().__init__()
        self.p = areas
        self.w = writer
        self.dropped, self.node_m2 = areas.twins()
        self.town = areas.in_town()

    def node(self, n):
        m2 = self.node_m2.get(n.id)
        self.w.add_node(n if m2 is None else n.replace(tags={**dict(n.tags), "area_m2": str(m2)}))

    def tags(self, o, kind, m2):
        tags = {**dict(o.tags), "area_m2": str(m2)}
        # the style shades the yard only around houses no town polygon covers
        if (kind, o.id) in self.town:
            tags["in_town"] = "1"
        # the point is drawn; the area would draw the name again
        if (kind, o.id) in self.dropped:
            tags.pop("place", None)
        return tags

    def way(self, w):
        m2 = self.p.ways.get(w.id)
        self.w.add_way(w if m2 is None else w.replace(tags=self.tags(w, "w", m2)))

    def relation(self, r):
        m2 = self.p.relations.get(r.id)
        self.w.add_relation(r if m2 is None else r.replace(tags=self.tags(r, "r", m2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    areas = Areas()
    areas.apply_file(a.pbf, locations=True, idx="flex_mem")
    Path(a.out).unlink(missing_ok=True)
    writer = osmium.SimpleWriter(a.out)
    write = Write(areas, writer)
    try:
        write.apply_file(a.pbf)
    finally:
        writer.close()
    print(f"Area: {len(areas.ways)} ways and {len(areas.relations)} relations; "
          f"{len(write.dropped)} place areas left to their point; "
          f"{len(write.town)} of {len(areas.centres)} buildings in built-up land")


if __name__ == "__main__":
    main()
