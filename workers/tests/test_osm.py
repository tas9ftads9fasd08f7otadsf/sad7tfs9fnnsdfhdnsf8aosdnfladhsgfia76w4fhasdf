import os
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace

from load import FIXTURES, WORKERS, needs, worker


def read(path):
    """`{("n"|"w"|"r", id): tags}` of an OSM file."""
    import osmium
    out = {}
    for o in osmium.FileProcessor(path):
        out[(o.type_str(), o.id)] = dict(o.tags)
    return out


@needs("osmium")
class Rail(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = worker("rail/lines.py")

    def test_speed(self):
        self.assertEqual(self.r.speed("80;60"), 80)
        self.assertEqual(self.r.speed("50 mph"), 80)
        self.assertIsNone(self.r.speed("none"))
        self.assertIsNone(self.r.speed(""))

    def test_gauge(self):
        self.assertEqual(self.r.gauge("1435;1520"), 1520)
        self.assertIsNone(self.r.gauge("standard"))

    def test_bearing(self):
        def p(lat, lon):
            return SimpleNamespace(lat=lat, lon=lon)
        self.assertAlmostEqual(self.r.bearing(p(48, 17), p(49, 17)), 0)
        self.assertAlmostEqual(self.r.bearing(p(48, 17), p(48, 18)), 90, delta=0.5)
        self.assertAlmostEqual(self.r.bearing(p(48, 17), p(47, 17)), 180)

    def test_speed_changes(self):
        self.assertEqual(self.r.speed_changes({1: [(80, "end"), (120, "start")]}), {1: (80, 120)})
        self.assertEqual(self.r.speed_changes({1: [(120, "end"), (80, "start")]}), {1: (120, 80)})
        self.assertEqual(self.r.speed_changes({1: [(120, "start"), (80, "start")]}), {1: (80, 120)})
        self.assertEqual(self.r.speed_changes({1: [(80, "end"), (80, "start")], 2: [(80, "end")]}), {})

    def test_rewrite_writes_a_readable_pbf(self):
        # fix 843: PBF writing broke on pyosmium 3
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "rail.osm.pbf")
            r = subprocess.run([sys.executable, os.path.join(WORKERS, "rail/lines.py"),
                                "--pbf", os.path.join(FIXTURES, "rail.osm"), "--out", out],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            tags = read(out)
        self.assertEqual(tags[("w", 10)]["colour"], "#0000cc", "the tram line wins the colour")
        self.assertEqual(tags[("w", 10)]["route_ref"], "4;R10")
        self.assertEqual(tags[("w", 10)]["rail_gauge"], "1520")
        self.assertEqual(tags[("w", 11)]["colour"], "#cc0000")
        self.assertEqual(tags[("w", 11)]["route_ref"], "R10;Os 3301")
        self.assertEqual((tags[("n", 3)]["rail_speed_prev"], tags[("n", 3)]["rail_speed"]), ("80", "121"))
        self.assertEqual(tags[("n", 2)]["rail_bearing"], "90")
        self.assertEqual(tags[("n", 5)]["rail_bearing"], "270")
        self.assertIn(("r", 20), tags)



@needs("osmium")
class RoutingNetwork(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.n = worker("routing/network.py")
        cls.fmt = sys.modules["format"]
        cls.net = cls.n.load(os.path.join(FIXTURES, "roads.osm"))

    def edge(self, way):
        [e] = [e for e in self.net.edges if e["way"] == way]
        return e

    def test_only_roads_cut_at_junctions(self):
        self.assertEqual(sorted({e["way"] for e in self.net.edges}), [100, 101, 102, 103, 104])
        self.assertEqual(set(self.net.nodes), {1, 2, 3, 4, 5, 7})
        self.assertEqual(self.edge(104)["geom"], [(482010000, 171210000)])

    def test_direction(self):
        both = self.fmt.D_FORWARD | self.fmt.D_BACKWARD
        self.assertEqual(self.edge(100)["direction"], both)
        self.assertEqual(self.edge(101)["direction"], self.fmt.D_FORWARD)
        self.assertEqual(self.edge(103)["direction"], self.fmt.D_BACKWARD)
        self.assertEqual(self.edge(104)["direction"], self.fmt.D_FORWARD, "a roundabout is one-way")

    def test_length_is_haversine(self):
        expected = self.n._haversine(48.2, 17.1, 48.2, 17.11) * 100
        self.assertAlmostEqual(self.edge(100)["length_cm"], expected, delta=1)
        self.assertAlmostEqual(expected / 100, 741.6, delta=1)

    def test_restrictions(self):
        kinds = self.fmt.RESTRICTION_KINDS
        got = {kinds[r["kind"]]: r for r in self.net.restrictions}
        self.assertEqual(sorted(got), ["no_left_turn", "only_straight_on"])
        self.assertEqual(got["no_left_turn"]["edges"], [(1, 2), (2, 4)])
        self.assertEqual(got["no_left_turn"]["via"], 2)
        spared = {self.fmt.EXCEPTIONS[i] for i in range(len(self.fmt.EXCEPTIONS))
                  if got["no_left_turn"]["exceptions"] >> i & 1}
        self.assertEqual(spared, {"bicycle", "psv"})
        self.assertEqual(got["only_straight_on"]["edges"], [(4, 2), (2, 3), (3, 7)])
        self.assertEqual(self.net.skipped["restriction:hgv"], 1)



def box_m2(dlon, dlat, lat):
    import math
    deg = 6371008.8 * math.pi / 180
    return dlon * deg * math.cos(math.radians(lat)) * dlat * deg


@needs("osmium")
class Buildings(unittest.TestCase):
    def test_area_on_ways_and_multipolygons(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "b.osm.pbf")
            r = subprocess.run([sys.executable, os.path.join(WORKERS, "buildings/areas.py"),
                                "--pbf", os.path.join(FIXTURES, "buildings.osm"), "--out", out],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            tags = read(out)
        house = box_m2(0.0003, 0.0001, 48.15)
        court = box_m2(0.002, 0.001, 48.1605) - box_m2(0.0005, 0.0003, 48.1605)
        self.assertAlmostEqual(int(tags[("w", 100)]["area_m2"]), house, delta=house * 0.01)
        self.assertAlmostEqual(int(tags[("r", 200)]["area_m2"]), court, delta=court * 0.01)
        self.assertNotIn("area_m2", tags[("w", 103)])
        self.assertNotIn("area_m2", tags[("w", 101)])

    def test_a_place_with_a_point_is_named_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "p.osm.pbf")
            r = subprocess.run([sys.executable, os.path.join(WORKERS, "buildings/areas.py"),
                                "--pbf", os.path.join(FIXTURES, "places.osm"), "--out", out],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            tags = read(out)
        self.assertNotIn("place", tags[("w", 200)], "same name, point inside")
        self.assertNotIn("place", tags[("r", 300)], "same wikidata")
        self.assertEqual(tags[("r", 300)]["admin_level"], "9")
        self.assertEqual(tags[("w", 202)]["place"], "village", "no point of its own")
        self.assertEqual(tags[("w", 203)]["place"], "village", "a namesake elsewhere")
        self.assertIn("area_m2", tags[("w", 202)])
        bystrica = box_m2(0.02, 0.015, 48.2375)
        self.assertAlmostEqual(int(tags[("n", 100)]["area_m2"]), bystrica, delta=bystrica * 0.01)
        self.assertIn("area_m2", tags[("n", 101)])
        self.assertNotIn("area_m2", tags[("n", 102)])

    def test_ring_area(self):
        a = worker("buildings/areas.py")
        self.assertEqual(a.ring_area([(0, 0), (1, 1), (0, 0)]), 0.0)
        ring = [(17.1, 48.15), (17.1003, 48.15), (17.1003, 48.1501), (17.1, 48.1501), (17.1, 48.15)]
        self.assertAlmostEqual(a.ring_area(ring), box_m2(0.0003, 0.0001, 48.15), delta=1)


@needs("osmium")
class BoundaryLabels(unittest.TestCase):
    def test_a_municipality_its_settlement_names_is_marked(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "m.osm.pbf")
            r = subprocess.run([sys.executable, os.path.join(WORKERS, "boundaries/labels.py"),
                                "--pbf", os.path.join(FIXTURES, "municipalities.osm"), "--out", out],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            tags = read(out)
        self.assertEqual(tags[("r", 301)].get("named_by_place"), "yes", "same name, point inside")
        self.assertEqual(tags[("r", 302)].get("named_by_place"), "yes", "same wikidata")
        self.assertNotIn("named_by_place", tags[("r", 303)], "a namesake elsewhere")
        self.assertNotIn("named_by_place", tags[("r", 304)], "only municipalities")
        self.assertEqual(tags[("r", 301)]["name"], "Svätý Jur")
        # 568 bug: the district's own name gave way to its hamlet point, which says only "Záhorie"
        self.assertNotIn("named_by_place", tags[("r", 305)], "a military district names itself")


class PlaceTwins(unittest.TestCase):
    def test_twins(self):
        t = worker("lib/place_twins.py")
        points = [(1, "A", "Q1", 17.0, 48.0), (2, "B", None, 17.5, 48.5), (3, "C", None, 30.0, 10.0)]
        areas = [("a", "A-district", "Q1", (0, 0, 1, 1)),
                 ("b", "B", None, (17.4, 48.4, 17.6, 48.6)),
                 ("c", "C", None, (17.4, 48.4, 17.6, 48.6)),
                 ("d", None, None, (17.4, 48.4, 17.6, 48.6))]
        self.assertEqual(t.twins(points, areas), {"a": 1, "b": 2})
        self.assertEqual(t.bbox([(1, 5), (3, 2), (2, 9)]), (1, 2, 3, 9))


@needs("osmium")
class Trails(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = worker("trails/routes.py")

    def test_way_class(self):
        self.assertEqual(self.t.way_class({"highway": "path"}), "path")
        self.assertEqual(self.t.way_class({"highway": "Track "}), "path")
        self.assertEqual(self.t.way_class({"highway": "secondary"}), "road")
        self.assertEqual(self.t.way_class({}), "road")

    def test_on_cycleway(self):
        # 510 Mapy draws a cycle route solid on a cycleway and dashed on a road or track
        self.assertTrue(self.t.on_cycleway({"highway": "cycleway"}))
        self.assertTrue(self.t.on_cycleway({"highway": "path", "bicycle": "designated"}))
        self.assertTrue(self.t.on_cycleway(
            {"highway": "path", "bicycle": "designated", "surface": "paving_stones"}))
        self.assertFalse(self.t.on_cycleway(
            {"highway": "path", "bicycle": "designated", "surface": "gravel"}))
        # 532 route 007 on a gravel cycleway in the Tatras is dashed in Mapy, as on a track
        self.assertFalse(self.t.on_cycleway({"highway": "cycleway", "surface": "gravel"}))
        self.assertFalse(self.t.on_cycleway({"highway": "cycleway", "surface": "fine_gravel"}))
        self.assertTrue(self.t.on_cycleway({"highway": "cycleway", "surface": "asphalt"}))
        self.assertFalse(self.t.on_cycleway({"highway": "path", "bicycle": "yes"}))
        self.assertFalse(self.t.on_cycleway({"highway": "track", "bicycle": "designated"}))
        self.assertFalse(self.t.on_cycleway({"highway": "tertiary"}))

    def test_straight_line_untouched(self):
        line = [[17.0, 48.0], [17.001, 48.0], [17.002, 48.0]]
        self.assertEqual(self.t.ease_corners(line), (line, 0))

    def test_sharp_turn_eased_ends_kept(self):
        # a hairpin: there and almost straight back
        line = [[17.0, 48.0], [17.001, 48.0], [17.0, 48.00002]]
        out, eased = self.t.ease_corners(line)
        self.assertEqual(eased, 1)
        self.assertEqual((out[0], out[-1]), (line[0], line[-1]))
        self.assertGreater(len(out), len(line))
        self.assertNotIn(line[1], out)

    def test_orient_ways(self):
        # 1→2, 3→2 (backwards), 3→4: one chain, the middle one flipped
        flip, conflicts, chains = self.t.orient_ways({10: (1, 2), 11: (3, 2), 12: (3, 4)})
        self.assertEqual((chains, conflicts), (1, 0))
        self.assertEqual(len(flip), 1)
        self.assertEqual(self.t.orient_ways({10: (1, 2), 11: (5, 6)})[2], 2)

    def test_ways_keep_their_own_direction_as_mapy_does(self):
        # 530 Mapy sets the side from each way's own OSM direction: 72 of 72 sampled ways, chained or not
        ends = {10: (1, 2), 11: (3, 2), 12: (3, 4)}
        flip, conflicts, chains = self.t.orient_ways(ends, None, follow_chains=False)
        self.assertEqual((flip, chains), (set(), 1))
        self.assertEqual(conflicts, 2, "the two joints where the side jumps")
        self.assertFalse(self.t.FOLLOW_CHAINS)

    def test_orient_ways_keeps_most_of_a_chain_as_drawn_in_osm(self):
        # 513 Mapy draws a walking route right of the OSM direction, so most length keeps it
        ends = {10: (2, 1), 11: (3, 2), 12: (3, 4)}
        flip, conflicts, _ = self.t.orient_ways(ends, {10: 40, 11: 30, 12: 5})
        self.assertEqual((flip, conflicts), ({12}, 0))
        flip, _, _ = self.t.orient_ways(ends, {10: 2, 11: 2, 12: 50})
        self.assertEqual(flip, {10, 11})

    def test_orient_ways_starts_a_new_chain_at_a_junction(self):
        # 513 three ways at node 2: each keeps its OSM direction instead of one network's
        flip, _, chains = self.t.orient_ways({10: (1, 2), 11: (2, 3), 12: (4, 2)})
        self.assertEqual((flip, chains), (set(), 3))

    def test_lane_order_stable_and_collapsed(self):
        base = {"route": "hiking", "colour": "red", "hex": "", "tier": "national", "ref": "", "name": ""}
        routes = [dict(base, rel=3, colour="blue", name="Modrá"),
                  dict(base, rel=1, ref="0001", name="Cesta SNP"),
                  dict(base, rel=2, ref="0001", name=""),
                  dict(base, rel=4, route="bicycle", tier="international", ref="EV13")]
        order = [r["rel"] for r in self.t.Ways.lane_order(routes)]
        self.assertEqual(order, [4, 3, 1], "the unnamed part collapses into its named parent")
        self.assertEqual(order, [r["rel"] for r in self.t.Ways.lane_order(list(reversed(routes)))])

    def test_colourless_route_rides_on_a_marked_one(self):
        # 456 E8 has no colour of its own: near Svidník it drew a second, dark red line
        base = {"route": "hiking", "colour": "red", "hex": "", "tier": "national", "ref": "0901", "name": ""}
        e8 = dict(base, rel=192031, colour="", tier="international", ref="E8", name="E8")
        order = [r["rel"] for r in self.t.Ways.lane_order([dict(base, rel=1), e8])]
        self.assertEqual(order, [1])
        # alone, or beside a route of another kind, it keeps its lane
        self.assertEqual([r["rel"] for r in self.t.Ways.lane_order([e8])], [192031])
        bike = dict(base, rel=2, route="bicycle")
        self.assertEqual(sorted(r["rel"] for r in self.t.Ways.lane_order([bike, e8])), [2, 192031])

    def test_cycle_routes_share_one_lane_whatever_their_colour(self):
        # 526 in Pieniny three cycle routes tagged green, red and blue made three stripes; Mapy one
        bike = {"route": "bicycle", "hex": ""}
        lanes = [dict(bike, colour="green"), dict(bike, colour="red"), dict(bike, colour="blue")]
        self.assertEqual(self.t.Ways.lane_slots(lanes), [(-1, 0, 0), (-1, 1, 0), (-1, 2, 0)])
        hike = {"route": "hiking", "hex": ""}
        self.assertEqual(self.t.Ways.lane_slots([dict(hike, colour="green"), dict(hike, colour="red")]),
                         [(1, 0, 0), (1, 1, 1)])

    def test_lane_slots_share_a_lane_per_colour(self):
        base = {"route": "hiking", "colour": "red", "hex": ""}
        lanes = [dict(base), dict(base), dict(base, colour="blue"),
                 dict(base, route="ski"), dict(base, route="bicycle", colour=""),
                 dict(base, route="mtb", colour="")]
        self.assertEqual(self.t.Ways.lane_slots(lanes),
                         [(1, 0, 0), (1, 1, 0), (1, 2, 1), (1, 3, 0), (-1, 0, 0), (-1, 1, 1)])

    def test_educational_trail_gets_a_lane_outside_the_marks(self):
        # 515 Mapy draws a náučný chodník dash-dot outside the marks, never on the green one
        base = {"route": "hiking", "colour": "green", "hex": "", "tier": "local", "ref": "", "name": ""}
        edu = dict(base, rel=1, edu=True, name="Náučný chodník Bílá hora")
        green = dict(base, rel=2, tier="regional")
        order = self.t.Ways.lane_order([edu, green])
        self.assertEqual([r["rel"] for r in order], [2, 1])
        self.assertEqual(self.t.Ways.lane_slots(order), [(1, 0, 0), (1, 1, 1)])

    def test_several_hiking_routes_stack_as_mapy_does(self):
        # 529 Mapy: red, blue, green, yellow outwards, a local route last, same colours on one lane
        base = {"route": "hiking", "colour": "", "hex": "", "tier": "regional", "ref": "", "name": ""}
        marks = [dict(base, rel=1, colour="yellow", ref="8104"),
                 dict(base, rel=2, colour="green", tier="local", ref="5148M"),
                 dict(base, rel=3, colour="red", tier="national", ref="0701"),
                 dict(base, rel=4, colour="red", tier="national", ref=""),
                 dict(base, rel=5, colour="blue", ref="2404")]
        order = self.t.Ways.lane_order(marks)
        self.assertEqual([r["colour"] for r in order], ["red", "red", "blue", "yellow", "green"])
        self.assertEqual([lane for _, _, lane in self.t.Ways.lane_slots(order)], [0, 0, 1, 2, 3])

    def test_hiking_colour_without_osmc_symbol_draws_nothing(self):
        # 531 Mapy gave none of 7 Slovak colour-only routes a stripe (Has50 near Šaštín-Stráže)
        def relation(**tags):
            members = [SimpleNamespace(type="w", ref=7, role="")]
            return SimpleNamespace(id=1, members=members,
                                   tags=[SimpleNamespace(k=k, v=v) for k, v in
                                         dict(type="route", route="hiking", **tags).items()])
        routes = self.t.Routes()
        routes.relation(relation(colour="green", ref="Has50", network="lwn"))
        routes.relation(relation(color="red"))
        self.assertEqual((routes.routes, dict(routes.by_way)), (0, {}))
        self.assertEqual(routes.skipped["hiking without osmc:symbol"], 2)
        routes.relation(relation(colour="green", **{"osmc:symbol": "green:white:green_bar"}))
        self.assertEqual((routes.routes, len(routes.by_way[7])), (1, 1))

    def test_hiking_with_neither_colour_nor_symbol_draws_nothing(self):
        # 536 Mariánska cesta, Sultans Trail and the Bratislava city routes drew red; Mapy draws none
        def relation(**tags):
            members = [SimpleNamespace(type="w", ref=9, role="")]
            return SimpleNamespace(id=2, members=members,
                                   tags=[SimpleNamespace(k=k, v=v) for k, v in
                                         {"type": "route", "route": "hiking", **tags}.items()])
        routes = self.t.Routes()
        routes.relation(relation(ref="M05-13", network="iwn", name="Mariánska cesta"))
        routes.relation(relation(ref="E8", network="iwn"))
        routes.relation(relation(name="Náučný chodník Na dobrej stope", network="lwn"))
        self.assertEqual((routes.routes, dict(routes.by_way)), (0, {}))
        # cycle routes and walks are not hiking marks: they keep their own look
        routes.relation(relation(route="bicycle", ref="O1", network="lcn"))
        self.assertEqual(routes.routes, 1)

    def test_is_educational(self):
        # 515 the diagonal stripe of the mark, or the name, says it is educational
        tags = __import__("tags")
        self.assertTrue(tags.is_educational({}, "slash"))
        self.assertTrue(tags.is_educational({"name": "Náučný chodník Kliny"}, "bar"))
        self.assertTrue(tags.is_educational({"name": "Lesnícky náučný chodník"}, None))
        self.assertTrue(tags.is_educational({"educational": "yes"}, "bar"))
        self.assertFalse(tags.is_educational({"name": "Tatranská magistrála"}, "bar"))


if __name__ == "__main__":
    unittest.main()
