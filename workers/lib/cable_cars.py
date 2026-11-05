#!/usr/bin/env python3
"""Marks cable cars and lifts in the mountains `riki:mountain=yes`, stations by a cable car `riki:cabin=yes`.

    python3 workers/lib/cable_cars.py --pbf=data/ski.osm.pbf --out=data/ski-marked.osm.pbf

In the mountains: touching a ski area, ending by a piste or a ski lift, or crossing a range of
`maps.mountains`. Ski & winter takes a cable car only there; Railways takes every one.
"""
import argparse
import math
import os
import sys
from collections import defaultdict

import osmium

_WORKERS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CABINS = {"cable_car", "gondola", "mixed_lift", "goods"}
SKI_LIFTS = {"chair_lift", "drag_lift", "t-bar", "j-bar", "platter", "rope_tow", "magic_carpet"}
PLANNED = ("construction", "proposed")
MOUNTAIN = "riki:mountain"
CABIN = "riki:cabin"
# a lift's end this close to a piste or a ski lift is in the resort
NEAR_M = 300
# a station this close to a cable car's end serves it
STATION_M = 150
CELL = 0.01


def kind(tags):
    """The lift's kind, also of one being built or planned; None for no lift line."""
    value = tags.get("aerialway")
    if value in PLANNED:
        return tags.get(f"{value}:aerialway") or tags.get(value)
    if value and value not in ("station", "pylon"):
        return value
    return next((tags.get(f"{p}:aerialway") for p in PLANNED if tags.get(f"{p}:aerialway")), None)


def is_planned(tags):
    return tags.get("aerialway") in PLANNED or any(f"{p}:aerialway" in tags for p in PLANNED)


def metres(a, b):
    dx = (a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot(dx, a[1] - b[1]) * 111_320


def inside(point, ring):
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


class Points:
    """Points in a coarse grid, to ask what is near."""

    def __init__(self):
        self.cells = defaultdict(list)

    def add(self, point):
        self.cells[(int(point[0] // CELL), int(point[1] // CELL))].append(point)

    def near(self, point, limit):
        cx, cy = int(point[0] // CELL), int(point[1] // CELL)
        return any(metres(point, p) <= limit for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                   for p in self.cells.get((cx + dx, cy + dy), ()))


class Areas:
    """Outer rings with their boxes."""

    def __init__(self):
        self.rings = []

    def add(self, ring):
        if len(ring) < 3:
            return
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        self.rings.append(((min(xs), min(ys), max(xs), max(ys)), ring))

    def contain(self, point):
        x, y = point
        return any(box[0] <= x <= box[2] and box[1] <= y <= box[3] and inside(point, ring)
                   for box, ring in self.rings)


def ranges():
    """The outer rings of every range in `maps.mountains`, its box where it has no outline."""
    sys.path.insert(0, os.path.join(_WORKERS, "mountain"))
    import plan
    areas = plan.registry("areas")
    found = Areas()
    for key, entry in plan.registry("mountains").items():
        cut = areas.get(entry.get("area"))
        if not cut:
            continue
        shape = plan.shape(key, [float(v) for v in cut["bbox"]])
        for ring, hole in plan.rings(shape):
            if not hole:
                found.add([tuple(p) for p in ring])
    return found


class Survey(osmium.SimpleHandler):
    def __init__(self, mountains):
        super().__init__()
        self.ski_areas = Areas()
        self.mountains = mountains
        self.resort = Points()
        self.lifts = {}
        self.stations = {}

    def node(self, n):
        if n.tags.get("aerialway") == "station" and n.location.valid():
            self.stations[("n", n.id)] = (n.location.lon, n.location.lat)

    def way(self, w):
        points = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if not points:
            return
        tags = w.tags
        if "piste:type" in tags or (tags.get("aerialway") in SKI_LIFTS and not is_planned(tags)):
            for p in points:
                self.resort.add(p)
        if tags.get("aerialway") == "station":
            self.stations[("w", w.id)] = (sum(p[0] for p in points) / len(points),
                                         sum(p[1] for p in points) / len(points))
        elif kind(tags):
            self.lifts[w.id] = (tags.get("aerialway") in CABINS or kind(tags) in CABINS, points)

    def area(self, a):
        if a.tags.get("landuse") != "winter_sports":
            return
        for outer in a.outer_rings():
            self.ski_areas.add([(n.lon, n.lat) for n in outer if n.location.valid()])

    def in_mountains(self, points, ends):
        return (any(self.ski_areas.contain(p) or self.mountains.contain(p) for p in points)
                or any(self.resort.near(p, NEAR_M) for p in ends))

    def marks(self):
        """`{("w"|"n", id): {tag: "yes"}}` of every lift and station to mark."""
        out = {}
        cabin_ends, mountain_ends = Points(), Points()
        for way_id, (cabin, points) in self.lifts.items():
            ends = [points[0], points[-1]]
            tags = {}
            if self.in_mountains(points, ends):
                tags[MOUNTAIN] = "yes"
                for p in ends:
                    mountain_ends.add(p)
            if cabin:
                for p in ends:
                    cabin_ends.add(p)
            if tags:
                out[("w", way_id)] = tags
        for key, point in self.stations.items():
            tags = {}
            if self.in_mountains([point], [point]) or mountain_ends.near(point, STATION_M):
                tags[MOUNTAIN] = "yes"
            if cabin_ends.near(point, STATION_M):
                tags[CABIN] = "yes"
            if tags:
                out[key] = tags
        return out


class Mark(osmium.SimpleHandler):
    def __init__(self, marks, writer):
        super().__init__()
        self.marks = marks
        self.w = writer

    def node(self, n):
        extra = self.marks.get(("n", n.id))
        self.w.add_node(n.replace(tags=dict(n.tags, **extra)) if extra else n)

    def way(self, w):
        extra = self.marks.get(("w", w.id))
        self.w.add_way(w.replace(tags=dict(w.tags, **extra)) if extra else w)

    def relation(self, r):
        self.w.add_relation(r)


def mark(pbf, out, mountains=None):
    survey = Survey(ranges() if mountains is None else mountains)
    survey.apply_file(pbf, locations=True, idx="flex_mem")
    marks = survey.marks()
    if os.path.exists(out):
        os.remove(out)
    writer = osmium.SimpleWriter(out)
    try:
        Mark(marks, writer).apply_file(pbf)
    finally:
        writer.close()
    return marks


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    marks = mark(args.pbf, args.out)
    mountain = sum(MOUNTAIN in m for m in marks.values())
    by_cabin = sum(CABIN in m for m in marks.values())
    print(f"In the mountains: {mountain} lifts and stations; by a cable car: {by_cabin} stations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
