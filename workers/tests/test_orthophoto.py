import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from load import WORKERS, needs, worker

aerial = worker("mountain/aerial.py")
tiles = worker("rocks-shading/tiles.py")
ortho = worker("deploy/orthophoto-manifest.py")
catalog = worker("deploy/catalog.py")
packages = worker("deploy/packages.py")
jobs = worker("state/jobs.py")
settings = worker("lib/map_settings.py")

ROOT = os.path.dirname(WORKERS)
SLOVAK = (
    "bratislavsky",
    "trnavsky",
    "trenciansky",
    "nitriansky",
    "zilinsky",
    "banskobystricky",
    "presovsky",
    "kosicky",
)


def options(region):
    """The `opt_*` outputs `options.py` writes for a region."""
    tmp = tempfile.mkdtemp()
    out = os.path.join(tmp, "out.txt")
    try:
        subprocess.run(
            [
                sys.executable,
                os.path.join(WORKERS, "plan", "options.py"),
                f"--region={region}",
                "--test=false",
                "--publish-pages=false",
                f"--out={out}",
            ],
            check=True,
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        with open(out, encoding="utf-8") as f:
            return dict(line.rstrip("\n").split("=", 1) for line in f if "=" in line)
    finally:
        shutil.rmtree(tmp)


class Source(unittest.TestCase):
    def test_the_third_cycle_covers_slovakia_and_goes_deeper_online(self):
        # 584 the source the kraje are built from, and what the app loads past it
        src = settings.aerial_sources()["ortofoto_sk_3c"]
        self.assertEqual((src["covers"], src["maxzoom"], src["season"]), (["SK"], 17, "summer"))
        self.assertGreater(src["online_maxzoom"], src["maxzoom"])
        self.assertIn("{bbox-epsg-3857}", src["url"])
        self.assertIn("ortofoto_sk_3c", catalog.online_aerial(settings.aerial_sources()))

    def test_every_kraj_takes_it_and_austria_none(self):
        # 584
        for region in SLOVAK:
            got = options(region)
            self.assertEqual((got["opt_orthophoto"], got["opt_orthophoto_maxzoom"]), ("ortofoto_sk_3c", "17"), region)
            self.assertTrue(got["opt_orthophoto_url"].startswith("https://"), region)
        self.assertEqual(options("wien")["opt_orthophoto"], "")


class WmsTiles(unittest.TestCase):
    def test_a_tile_box_is_web_mercator_metres(self):
        # 584 a WMS GetMap is asked for the very box the XYZ tile covers
        half = tiles.MERCATOR_HALF
        self.assertEqual(tiles.mercator_bbox(0, 0, 0), f"{-half:.3f},{-half:.3f},{half:.3f},{half:.3f}")
        w, s, e, n = (float(v) for v in tiles.mercator_bbox(1, 1, 0).split(","))
        self.assertEqual((w, s), (0.0, 0.0))
        self.assertAlmostEqual(e, half, places=2)
        self.assertAlmostEqual(n, half, places=2)

    def test_the_fetcher_fills_the_box_and_keeps_the_query(self):
        # 584 the query was dropped before, so a WMS address lost its every parameter
        f = tiles.Fetcher("https://example.org/wms?BBOX={bbox-epsg-3857}&WIDTH=256", "/tmp/none")
        self.assertEqual(f.url(0, 0, 0), "https://example.org/wms?BBOX=" + tiles.mercator_bbox(0, 0, 0) + "&WIDTH=256")
        self.assertEqual(
            tiles.Fetcher("https://t.example/{z}/{x}/{y}.jpg", "/tmp/none").url(3, 4, 5), "https://t.example/3/4/5.jpg"
        )


class WebP(unittest.TestCase):
    @needs("PIL")
    def test_a_jpeg_becomes_webp_and_a_cut_tile_stays(self):
        # 584
        from PIL import Image

        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        jpeg = os.path.join(tmp, "t.jpg")
        Image.new("RGB", (256, 256), (40, 90, 40)).save(jpeg, "JPEG")
        got = aerial.as_webp(jpeg)
        with Image.open(got) as img:
            self.assertEqual(img.format, "WEBP")
        cut = os.path.join(tmp, "t.jpg.cut.webp")
        self.assertEqual(aerial.as_webp(cut), cut)

    @needs("PIL", "pmtiles")
    def test_the_archive_says_webp(self):
        # 584 the app and MapLibre read the tile type from the header
        from PIL import Image
        from pmtiles.reader import MmapSource, Reader
        from pmtiles.tile import TileType

        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        jpeg = os.path.join(tmp, "t.jpg")
        Image.new("RGB", (256, 256), (40, 90, 40)).save(jpeg, "JPEG")
        out = os.path.join(tmp, "presovsky-orthophoto.pmtiles")
        aerial.write(out, {(8, 142, 87): aerial.as_webp(jpeg)}, [20.0, 49.0, 21.0, 49.4], 8, 8, "p", webp=True)
        with open(out, "rb") as f:
            reader = Reader(MmapSource(f))
            self.assertEqual(reader.header()["tile_type"], TileType.WEBP)
            self.assertEqual(reader.metadata()["format"], "webp")
        self.assertEqual(ortho.pmtiles_zooms(out), (8, 8))


class Manifest(unittest.TestCase):
    def test_the_region_names_its_photos_beside_what_it_had(self):
        # 584
        before = {"default_region": "presovsky", "regions": {"presovsky": {"maxzoom": 16}}}
        got = ortho.add(before, "presovsky", "tiles/presovsky-orthophoto.pmtiles", "ortofoto_sk_3c", (8, 17))
        reg = got["regions"]["presovsky"]
        self.assertEqual(reg["maxzoom"], 16)
        self.assertEqual(
            (reg["orthophoto"], reg["orthophoto_maxzoom"], reg["orthophoto_source"]),
            ("tiles/presovsky-orthophoto.pmtiles", 17, "ortofoto_sk_3c"),
        )
        self.assertNotIn("orthophoto", before["regions"]["presovsky"], "the old manifest is left alone")

    def test_a_manifest_of_nothing_gets_the_region(self):
        # 584
        got = ortho.add({}, "kosicky", "tiles/kosicky-orthophoto.pmtiles", "", (8, 17))
        self.assertEqual(got["default_region"], "kosicky")
        self.assertNotIn("orthophoto_source", got["regions"]["kosicky"])

    def test_the_catalog_carries_the_archive(self):
        # 584
        reg = {"orthophoto": "tiles/kosicky-orthophoto.pmtiles"}
        self.assertEqual(catalog.tiles_paths({}, reg), reg)


class Package(unittest.TestCase):
    def test_orthophoto_is_a_package_that_regenerates_alone(self):
        # 584 a region build would take hours more; the photos come on their own
        p = packages.package("orthophoto")
        self.assertEqual((p["manifest"], p["suffixes"]), (["orthophoto"], ["-orthophoto.pmtiles"]))
        self.assertEqual(jobs.job("orthophoto")["package"], "orthophoto")
        self.assertEqual(jobs.fields("orthophoto", env={})["what"], "orthophoto")

    def test_the_package_is_published_without_a_rebuilt_map(self):
        # 584
        with open(os.path.join(ROOT, ".github", "workflows", "regenerate-region.yml"), encoding="utf-8") as f:
            text = f.read()
        self.assertIn("--format=webp", text)
        self.assertIn("orthophoto-manifest.py", text)
        self.assertIn("needs.orthophoto.result != 'failure'", text)


if __name__ == "__main__":
    unittest.main()
