import os
import tempfile
import unittest

from load import needs, worker
from test_add_layer import pmtiles


def tile(layers):
    import mapbox_vector_tile as mvt
    return mvt.encode([{"name": n,
                        "features": [{"geometry": "POINT(1 1)", "id": i, "properties": p} for i, p in features]}
                       for n, features in layers.items()])


class Overlap(unittest.TestCase):
    # 461 a peak in two packages is one shared object; a package's own archives count once
    @needs("pmtiles", "mapbox_vector_tile")
    def test_a_shared_object_is_found_by_its_osm_id(self):
        overlap = worker("tools/overlap.py")
        d = tempfile.mkdtemp()
        peak, spring = 1234 * 10 + 1, 99 * 10 + 1
        pmtiles(os.path.join(d, "r-names.pmtiles"),
                {(14, 1, 1): tile({"mountain": [(peak, {"class": "peak", "name": "Kriváň"})]})}, ["mountain"])
        pmtiles(os.path.join(d, "r-omt-landscape.pmtiles"),
                {(14, 1, 1): tile({"mountain_peak": [(peak, {"class": "peak"})]})}, ["mountain_peak"])
        pmtiles(os.path.join(d, "r-features.pmtiles"),
                {(14, 1, 1): tile({"feature_point": [(spring, {"class": "spring"})]})}, ["feature_point"])
        pmtiles(os.path.join(d, "r-trails.pmtiles"),
                {(14, 1, 1): tile({"trail": [(0, {"name": "Magistrála"})]})}, ["trail"])
        pmtiles(os.path.join(d, "r-routing.pmtiles"), {(14, 1, 1): b"not a vector tile"}, [])

        held, blind = overlap.by_package(d, overlap.package_suffixes())
        self.assertEqual(blind, ["r-trails.pmtiles"])
        self.assertEqual(set(held), {"names", "landscape"})
        self.assertEqual(len(held["landscape"]), 2, "both landscape archives, each object once")
        shared = overlap.overlaps(held)
        self.assertEqual(list(shared), [("landscape", "names")])
        self.assertEqual(list(shared[("landscape", "names")]), ["node/1234"])
        text = overlap.report(held, shared)
        self.assertIn("| landscape + names | 1 |", text)
        self.assertIn("| mountain_peak:peak | mountain:peak | 1 "
                      "| [Kriváň](https://www.openstreetmap.org/node/1234) |", text)

    # 461 a merged or made-up feature names no OSM object
    def test_a_tile_id_reads_as_an_osm_object(self):
        overlap = worker("tools/overlap.py")
        self.assertEqual(overlap.osm_object(5377767632), "way/537776763")
        self.assertEqual(overlap.osm_object(33), "relation/3")
        self.assertIsNone(overlap.osm_object(0))
        self.assertIsNone(overlap.osm_object(None))
        self.assertIsNone(overlap.osm_object(25))


if __name__ == "__main__":
    unittest.main()
