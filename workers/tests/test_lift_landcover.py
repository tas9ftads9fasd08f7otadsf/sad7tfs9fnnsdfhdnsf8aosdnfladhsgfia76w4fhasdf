import gzip
import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from unittest import mock

from load import needs, worker


def pmtiles(path, tiles):
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    with open(path, "wb") as f:
        w = Writer(f)
        for (z, x, y), raw in sorted(tiles.items(), key=lambda t: zxy_to_tileid(*t[0])):
            w.write_tile(zxy_to_tileid(z, x, y), gzip.compress(raw, mtime=0))
        zs = [z for z, _, _ in tiles]
        w.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
                    "min_zoom": min(zs), "max_zoom": max(zs), "center_zoom": min(zs),
                    "min_lon_e7": 0, "min_lat_e7": 0, "max_lon_e7": 10, "max_lat_e7": 10,
                    "center_lon_e7": 5, "center_lat_e7": 5},
                   {"vector_layers": [{"id": "landcover", "fields": {}}, {"id": "water", "fields": {}}]})


def tile(landcover, water=True):
    import mapbox_vector_tile as mvt
    layers = [{"name": "landcover", "features": [
        {"geometry": wkt, "properties": {"class": "wood", "subclass": "forest"}} for wkt in landcover]}]
    if water:
        layers.append({"name": "water", "features": [
            {"geometry": "POINT(5 5)", "properties": {"class": "lake"}}]})
    return mvt.encode(layers, default_options={"y_coord_down": True})


class LiftLandcover(unittest.TestCase):
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_clearing_planetiler_fills_at_z12_stays_open(self):
        import mapbox_vector_tile as mvt
        from pmtiles.reader import MmapSource, Reader
        from shapely.geometry import Point, shape

        lift = worker("tiles/lift-landcover.py")
        path = os.path.join(tempfile.mkdtemp(), "r.pmtiles")
        whole = "POLYGON((0 0, 4096 0, 4096 4096, 0 4096, 0 0))"
        # a clearing 6 px wide at z12, under Planetiler's 8 px
        clearing = "POLYGON((0 0, 4096 0, 4096 4096, 0 4096, 0 0), (3800 3800, 4000 3800, 4000 4000, 3800 4000, 3800 3800))"
        pmtiles(path, {(12, 0, 0): tile([whole]),
                       (13, 0, 0): tile([clearing], water=False),
                       (13, 1, 0): tile([whole], water=False),
                       (13, 0, 1): tile([whole], water=False),
                       (13, 1, 1): tile([whole], water=False)})
        with mock.patch("sys.argv", ["lift-landcover.py", path]), redirect_stderr(io.StringIO()):
            self.assertEqual(lift.main(), 0)
        with open(path, "rb") as f:
            got = mvt.decode(gzip.decompress(Reader(MmapSource(f)).get(12, 0, 0)),
                             default_options={"y_coord_down": True})
        forest = got["landcover"]["features"]
        self.assertEqual(len(forest), 1, "the four children meet without a seam")
        geom = shape(forest[0]["geometry"])
        self.assertFalse(geom.contains(Point(1950, 1950)), "the clearing is open")
        self.assertTrue(geom.contains(Point(3000, 3000)))
        self.assertEqual(got["water"]["features"][0]["properties"], {"class": "lake"})

    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_map_without_z13_is_left_alone(self):
        lift = worker("tiles/lift-landcover.py")
        path = os.path.join(tempfile.mkdtemp(), "r.pmtiles")
        pmtiles(path, {(12, 0, 0): tile(["POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))"])})
        before = open(path, "rb").read()
        with mock.patch("sys.argv", ["lift-landcover.py", path]), redirect_stderr(io.StringIO()):
            self.assertEqual(lift.main(), 0)
        self.assertEqual(open(path, "rb").read(), before)


if __name__ == "__main__":
    unittest.main()
