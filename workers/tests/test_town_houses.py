import os
import tempfile
import unittest

from load import needs, worker


@needs("osmium")
class TownHouses(unittest.TestCase):
    # 478 a house in built-up land is flagged; the hamlet shading draws only around the others
    def test_a_house_in_a_residential_area_is_in_town(self):
        import osmium
        areas = worker("buildings/areas.py")
        with tempfile.TemporaryDirectory() as tmp:
            src, out = os.path.join(tmp, "in.osm.pbf"), os.path.join(tmp, "out.osm.pbf")
            w = osmium.SimpleWriter(src)
            nid = [0]

            def square(x, y, d):
                ids = []
                for px, py in [(x, y), (x + d, y), (x + d, y + d), (x, y + d)]:
                    nid[0] += 1
                    w.add_node(osmium.osm.mutable.Node(id=nid[0], location=(px, py), version=1))
                    ids.append(nid[0])
                return ids + [ids[0]]

            town, house, hamlet = square(21.0, 49.0, 0.01), square(21.004, 49.004, 0.0002), square(21.05, 49.0, 0.0002)
            w.add_way(osmium.osm.mutable.Way(id=1, nodes=town, tags={"landuse": "residential"}, version=1))
            w.add_way(osmium.osm.mutable.Way(id=2, nodes=house, tags={"building": "house"}, version=1))
            w.add_way(osmium.osm.mutable.Way(id=3, nodes=hamlet, tags={"building": "house"}, version=1))
            w.close()

            found = areas.Areas()
            found.apply_file(src, locations=True, idx="flex_mem")
            writer = osmium.SimpleWriter(out)
            areas.Write(found, writer).apply_file(src)
            writer.close()

            tags = {}
            for o in osmium.FileProcessor(out):
                if o.is_way():
                    tags[o.id] = dict(o.tags)
        self.assertEqual(tags[2].get("in_town"), "1")
        self.assertNotIn("in_town", tags[3])
        self.assertNotIn("in_town", tags[1])

    def test_a_hole_in_the_town_is_not_town(self):
        areas = worker("buildings/areas.py")
        towns = areas.Towns()
        outer = [(0, 0), (1, 0), (1, 1), (0, 1)]
        hole = [(0.4, 0.4), (0.6, 0.4), (0.6, 0.6), (0.4, 0.6)]
        towns.add(outer, [hole])
        self.assertTrue(towns.holds(0.2, 0.2))
        self.assertFalse(towns.holds(0.5, 0.5))
        self.assertFalse(towns.holds(1.5, 0.5))


if __name__ == "__main__":
    unittest.main()
