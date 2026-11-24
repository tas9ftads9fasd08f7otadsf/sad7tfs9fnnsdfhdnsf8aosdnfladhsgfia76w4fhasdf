import gzip
import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from unittest import mock

from load import needs, worker
from test_lift_landcover import pmtiles


def tile(contours=True):
    import mapbox_vector_tile as mvt
    layers = [{"name": "water", "features": [{"geometry": "POINT(5 5)", "properties": {"class": "lake"}}]}]
    if contours:
        layers.append({"name": "contour", "features": [
            {"geometry": "LINESTRING(0 0, 100 0, 200 50)", "properties": {"ele": 550, "level": "major"}}]})
    return mvt.encode(layers, default_options={"y_coord_down": True})


class Uphill(unittest.TestCase):
    # 570 gdal_contour leaves the higher side on the right; a label's top is on the line's left
    @needs("pmtiles", "mapbox_vector_tile")
    def test_a_contour_is_turned_and_marked(self):
        import mapbox_vector_tile as mvt
        from pmtiles.reader import MmapSource, Reader

        uphill = worker("contours-rocks/uphill.py")
        path = os.path.join(tempfile.mkdtemp(), "c.pmtiles")
        pmtiles(path, {(14, 0, 0): tile(), (14, 1, 0): tile(contours=False)})
        before = open(path, "rb").read()
        with mock.patch("sys.argv", ["uphill.py", path]), redirect_stderr(io.StringIO()):
            self.assertEqual(uphill.main(), 0)
        with open(path, "rb") as f:
            r = Reader(MmapSource(f))
            got = mvt.decode(gzip.decompress(r.get(14, 0, 0)), default_options={"y_coord_down": True})
            plain = mvt.decode(gzip.decompress(r.get(14, 1, 0)), default_options={"y_coord_down": True})
        line = got["contour"]["features"][0]
        self.assertEqual(line["geometry"]["coordinates"], [[200, 50], [100, 0], [0, 0]])
        self.assertEqual(line["properties"], {"ele": 550, "level": "major", "uphill": 1})
        self.assertEqual(got["water"]["features"][0]["properties"], {"class": "lake"})
        self.assertNotIn("contour", plain)
        self.assertNotEqual(open(path, "rb").read(), before)

    # 572 bug: without the guard the stdlib-only unit job failed importing mapbox_vector_tile
    @needs("pmtiles", "mapbox_vector_tile")
    def test_reversed_geometry(self):
        uphill = worker("contours-rocks/uphill.py")
        self.assertEqual(uphill.reversed_geometry(
            {"type": "MultiLineString", "coordinates": [[[0, 0], [1, 1]], [[2, 2], [3, 3]]]}),
            {"type": "MultiLineString", "coordinates": [[[1, 1], [0, 0]], [[3, 3], [2, 2]]]})


class UphillInTheBuild(unittest.TestCase):
    # 573 bug: the contours job ran uphill.py on a runner without mapbox_vector_tile
    def test_the_build_installs_the_packages_before_the_step(self):
        script = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                   "contours-rocks", "build.sh")).read()
        step = script.index("contours-rocks/uphill.py")
        install = script.rfind("pip install", 0, step)
        self.assertNotEqual(install, -1, "no install before the step")
        line = script[install:script.index("\n", install)]
        for package in ("pmtiles", "mapbox-vector-tile"):
            self.assertIn(package, line)


if __name__ == "__main__":
    unittest.main()
