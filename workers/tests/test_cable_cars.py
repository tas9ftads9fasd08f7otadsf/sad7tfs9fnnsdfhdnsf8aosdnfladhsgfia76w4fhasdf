import os
import tempfile
import unittest

from load import needs, worker

# a resort at 20.00 E with a ski area, a piste and a chair lift; a town at 17.10 E
OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6">
{nodes}
 <way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
  <tag k="landuse" v="winter_sports"/></way>
 <way id="2"><nd ref="10"/><nd ref="11"/><tag k="piste:type" v="downhill"/></way>
 <way id="3"><nd ref="20"/><nd ref="21"/><tag k="aerialway" v="gondola"/></way>
 <way id="4"><nd ref="30"/><nd ref="31"/><tag k="aerialway" v="cable_car"/></way>
 <way id="5"><nd ref="40"/><nd ref="41"/><tag k="aerialway" v="construction"/>
  <tag k="construction" v="gondola"/></way>
 <way id="6"><nd ref="50"/><nd ref="51"/><tag k="aerialway" v="chair_lift"/></way>
</osm>
"""
NODES = {
    1: (20.0, 49.0), 2: (20.01, 49.0), 3: (20.01, 49.01), 4: (20.0, 49.01),
    10: (20.02, 49.02), 11: (20.025, 49.025),
    # from the valley into the ski area
    20: (19.98, 48.99), 21: (20.005, 49.005),
    # a town's cable car, far from any slope
    30: (17.10, 48.14), 31: (17.11, 48.15),
    # being built, its top by the piste
    40: (20.03, 49.03), 41: (20.0251, 49.0251),
    50: (20.05, 49.05), 51: (20.06, 49.06),
    # stations at the gondola's top and the town cable car's end
    60: (20.0051, 49.0051), 61: (17.1101, 48.1501),
}
STATIONS = {60, 61}


def write(path):
    nodes = "\n".join(
        f' <node id="{i}" lat="{lat}" lon="{lon}">'
        + ('<tag k="aerialway" v="station"/>' if i in STATIONS else "") + "</node>"
        for i, (lon, lat) in NODES.items())
    with open(path, "w", encoding="utf-8") as f:
        f.write(OSM.format(nodes=nodes))


@needs("osmium")
class CableCars(unittest.TestCase):
    # 473 a cable car is Ski & winter's in the mountains only; every one is Railways'
    def test_in_the_mountains_or_not(self):
        cc = worker("lib/cable_cars.py")
        with tempfile.TemporaryDirectory() as d:
            src, out = os.path.join(d, "in.osm"), os.path.join(d, "out.osm")
            write(src)
            marks = cc.mark(src, out, mountains=cc.Areas())
        self.assertEqual(marks.get(("w", 3)), {cc.MOUNTAIN: "yes"}, "into a ski area")
        self.assertNotIn(("w", 4), marks, "a town's cable car")
        self.assertEqual(marks.get(("w", 5)), {cc.MOUNTAIN: "yes"}, "built by a piste")
        self.assertEqual(marks.get(("n", 60)), {cc.MOUNTAIN: "yes", cc.CABIN: "yes"})
        self.assertEqual(marks.get(("n", 61)), {cc.CABIN: "yes"})

    # 473 a range of `maps.mountains` is mountains, slopes or not
    def test_a_range_is_mountains(self):
        cc = worker("lib/cable_cars.py")
        town = cc.Areas()
        town.add([(17.0, 48.0), (17.2, 48.0), (17.2, 48.2), (17.0, 48.2)])
        with tempfile.TemporaryDirectory() as d:
            src, out = os.path.join(d, "in.osm"), os.path.join(d, "out.osm")
            write(src)
            marks = cc.mark(src, out, mountains=town)
        self.assertEqual(marks.get(("w", 4)), {cc.MOUNTAIN: "yes"})

    def test_kind(self):
        cc = worker("lib/cable_cars.py")
        self.assertEqual(cc.kind({"aerialway": "gondola"}), "gondola")
        self.assertEqual(cc.kind({"aerialway": "proposed", "proposed": "cable_car"}), "cable_car")
        self.assertEqual(cc.kind({"construction:aerialway": "chair_lift"}), "chair_lift")
        self.assertIsNone(cc.kind({"aerialway": "station"}))
        self.assertTrue(cc.ranges().rings, "the ranges of `maps.mountains`")
