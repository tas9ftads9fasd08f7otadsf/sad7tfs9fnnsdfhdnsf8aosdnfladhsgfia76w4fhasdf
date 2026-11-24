import gzip
import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from unittest import mock

from load import needs, worker
from test_lift_landcover import pmtiles

# the base map's 8 px buffer at 512 px, in tile units
CUT = 64
# the area: x from 1000 to 3000 in tile (14, 0, 0), y from 1000 across the seam into (14, 0, 1)
TOP = f"POLYGON((1000 1000, 3000 1000, 3000 {4096 + CUT}, 1000 {4096 + CUT}, 1000 1000))"
BOTTOM = f"POLYGON((1000 {-CUT}, 3000 {-CUT}, 3000 2000, 1000 2000, 1000 {-CUT}))"


def tile(wkt):
    import mapbox_vector_tile as mvt
    return mvt.encode([
        {"name": "park", "features": [{"geometry": wkt, "id": 7,
                                       "properties": {"class": "chránená_krajinná_oblasť"}}]},
        {"name": "water", "features": [{"geometry": "POINT(5 5)", "properties": {"class": "lake"}}]}],
        default_options={"y_coord_down": True})


class ParkBorder(unittest.TestCase):
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def setUp(self):
        import mapbox_vector_tile as mvt
        from pmtiles.reader import MmapSource, Reader

        border = worker("tiles/park-border.py")
        path = os.path.join(tempfile.mkdtemp(), "r.pmtiles")
        pmtiles(path, {(14, 0, 0): tile(TOP), (14, 0, 1): tile(BOTTOM)})
        with mock.patch("sys.argv", ["park-border.py", path]), redirect_stderr(io.StringIO()):
            self.assertEqual(border.main(), 0)
        with open(path, "rb") as f:
            self.top = mvt.decode(gzip.decompress(Reader(MmapSource(f)).get(14, 0, 0)),
                                  default_options={"y_coord_down": True})

    def lines(self):
        from shapely.geometry import shape
        feats = self.top["park_border"]["features"]
        self.assertEqual([f["properties"] for f in feats], [{"class": "chránená_krajinná_oblasť"}])
        geom = shape(feats[0]["geometry"])
        return list(getattr(geom, "geoms", [geom]))

    # 564 the band along the polygon's cut edge striped the tile seam inside a park
    def test_the_cut_edge_at_the_tile_seam_is_no_border(self):
        for line in self.lines():
            for (_, y0), (_, y1) in zip(line.coords, line.coords[1:]):
                self.assertFalse(y0 == y1 and y0 > 4096, f"a segment along y={y0}")

    # 564 the band is offset to the right of the line, so the area must lie there
    def test_the_border_runs_clockwise_with_the_area_on_its_right(self):
        top_edge = [(a, b) for line in self.lines() for a, b in zip(line.coords, line.coords[1:])
                    if a[1] == b[1] == 1000]
        self.assertTrue(top_edge)
        for (x0, _), (x1, _) in top_edge:
            self.assertLess(x0, x1, "eastward along the top: south, the inside, is on the right")

    # 564 a 22 px band needs the border beyond the 8 px buffer of the base map
    def test_the_border_reaches_past_the_base_maps_buffer(self):
        lowest = max(y for line in self.lines() for _, y in line.coords)
        self.assertGreater(lowest, 4096 + CUT, "it came from the tile below")
        self.assertLessEqual(lowest, 4096 + 32 * 8)

    def test_other_layers_stay(self):
        self.assertEqual(self.top["water"]["features"][0]["properties"], {"class": "lake"})
        self.assertIn("park", self.top)


if __name__ == "__main__":
    unittest.main()
