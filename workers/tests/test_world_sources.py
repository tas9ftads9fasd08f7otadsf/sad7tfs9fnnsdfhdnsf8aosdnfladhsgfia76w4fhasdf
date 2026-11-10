import io
import os
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stdout
from unittest import mock

from load import worker

world = worker("world/sources.py")


def fake_download(failing):
    """`_download_once` that times out for the URLs in `failing` and writes a stub otherwise."""
    def once(url, dest, what, mb):
        if url in failing:
            raise urllib.error.URLError("timed out")
        with open(dest, "wb") as f:
            f.write(b"stub")
        return 4, 0.1
    return once


class WaterStandIn(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(world.time, "sleep")
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_quietly(self, fn, *args, **kwargs):
        with redirect_stdout(io.StringIO()) as out:
            return fn(*args, **kwargs), out.getvalue()

    def test_osm_down_gives_natural_earth_ocean(self):
        # 497 run 8 of "Build world" failed: osmdata.openstreetmap.de timed out 4 times
        osm = world.SOURCES["water"]["url"]
        with mock.patch.object(world, "_download_once", fake_download({osm})):
            (path, key), log = self.run_quietly(world.fetch_water, self.tmp.name)
        self.assertEqual(key, "ocean")
        self.assertEqual(os.path.basename(path), world.SOURCES["ocean"]["file"])
        self.assertIn("::warning::", log)
        self.assertFalse(os.path.exists(path + ".part"))

    def test_osm_up_keeps_osm(self):
        # 497 the stand-in never replaces a working OSM download
        with mock.patch.object(world, "_download_once", fake_download(set())):
            (path, key), _ = self.run_quietly(world.fetch_water, self.tmp.name)
        self.assertEqual(key, "water")
        self.assertEqual(os.path.basename(path), world.SOURCES["water"]["file"])

    def test_both_down_still_fails(self):
        # 497 without either sea the run fails rather than build a map without sea
        urls = {world.SOURCES["water"]["url"], world.SOURCES["ocean"]["url"]}
        with mock.patch.object(world, "_download_once", fake_download(urls)), \
                self.assertRaises(SystemExit):
            self.run_quietly(world.fetch_water, self.tmp.name)

    def test_required_source_still_fails(self):
        # 497 other sources keep failing the run as before
        url = world.SOURCES["lakes"]["url"]
        with mock.patch.object(world, "_download_once", fake_download({url})), \
                self.assertRaises(SystemExit):
            self.run_quietly(world.download, "lakes", self.tmp.name)


class CompleteMarker(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def touch(self, *keys):
        for k in keys:
            open(os.path.join(self.tmp.name, world.SOURCES[k]["file"]), "w").close()

    def marker(self):
        return os.path.join(self.tmp.name, world.COMPLETE)

    def test_all_sources_mark_complete(self):
        # 497 only a whole set of sources is worth the week's cache key
        self.touch("water", "lakes")
        self.assertTrue(world.mark_complete(self.tmp.name, ["water", "lakes"]))
        self.assertTrue(os.path.exists(self.marker()))

    def test_stand_in_is_not_complete(self):
        # 497 run 7 cached sources without the OSM sea and took the key for the week
        self.touch("ocean", "lakes")
        open(self.marker(), "w").close()
        self.assertFalse(world.mark_complete(self.tmp.name, ["water", "lakes"]))
        self.assertFalse(os.path.exists(self.marker()))


class PrepareWater(unittest.TestCase):
    def test_geojson_goes_to_ogr2ogr_as_is(self):
        # 497 the Natural Earth ocean is GeoJSON, not a shapefile in a ZIP
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, world.SOURCES["ocean"]["file"])
            open(src, "w").close()
            out = os.path.join(tmp, "water.gpkg")
            calls = []

            def run(cmd, **kwargs):
                calls.append(cmd)
                if cmd[0] == "ogr2ogr":
                    open(out, "w").close()
                return mock.Mock(stdout="Feature Count: 1\n")

            with mock.patch.object(world.shutil, "which", return_value="/usr/bin/ogr2ogr"), \
                    mock.patch.object(world.subprocess, "run", side_effect=run), \
                    redirect_stdout(io.StringIO()):
                world.prepare_water(src, out, "ocean")
            self.assertIn(os.path.abspath(src), calls[0])
            self.assertFalse(any(a.startswith("/vsizip/") for a in calls[0]))


if __name__ == "__main__":
    unittest.main()
