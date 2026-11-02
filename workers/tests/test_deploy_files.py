import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from unittest import mock

from load import WORKERS, worker

files = worker("deploy/files.py")
pack = worker("deploy/pack.py")
packages = files.packages


def touch(root, rel, data=b"x"):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


class Site(unittest.TestCase):
    TREE = ["index.html", "app.js", "style-overrides.json", "fonts/Noto Sans Regular/0-255.pbf",
            "tiles/manifest.json", "tiles/r.pmtiles", "tiles/r-trails.pmtiles", "tiles/r-routing.pmtiles",
            "tiles/r-rail.pmtiles", "tiles/r-rail-routing.pmtiles", "tiles/r-signs.json",
            "tiles/r-signs.png", "tiles/r-water.pmtiles", "tiles/r-terrain.pmtiles",
            "tiles/r-transport.pmtiles", "tiles/r-roadsigns.json",
            "tiles/r-roadsigns.png", "tiles/r-regulations.json",
            "sprites/osm-liberty.json", "styles/r-svetla.json"]

    def setUp(self):
        self.site = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.site)
        for rel in self.TREE:
            touch(self.site, rel)
        self.man = {"default_region": "r", "glyphs": "https://x/fonts/{fontstack}/{range}.pbf",
                    "regions": {"r": {"water": "tiles/r-water.pmtiles", "routing": "tiles/r-routing.pmtiles"}}}

    def rel(self, paths):
        return sorted(os.path.relpath(p, self.site) for p in paths)

    def test_suffix_isnt_a_longer_foreign_one(self):
        self.assertTrue(files.has_suffix("r-routing.pmtiles", ("-routing.pmtiles",)))
        self.assertFalse(files.has_suffix("r-rail-routing.pmtiles", ("-routing.pmtiles",)))
        self.assertTrue(files.has_suffix("r-rail-routing.pmtiles", ("-rail-routing.pmtiles",)))

    def test_package_files_from_manifest_then_suffix(self):
        water = packages.package("water")
        self.assertEqual(self.rel(files.package_files(self.site, self.man, water)), ["tiles/r-water.pmtiles"])
        rail = packages.package("railways")
        self.assertEqual(self.rel(files.package_files(self.site, {}, rail)),
                         ["tiles/r-rail-routing.pmtiles", "tiles/r-rail.pmtiles",
                          "tiles/r-signs.json", "tiles/r-signs.png"])

    def test_parts_of_the_base_map(self):
        parts = {k: self.rel(f) for k, _, f in files.base_parts(self.site, self.man)}
        self.assertEqual(parts, {"trails": ["tiles/r-trails.pmtiles"], "features": [],
                                 "routing": ["tiles/r-routing.pmtiles"],
                                 "signs": ["tiles/r-signs.json", "tiles/r-signs.png"],
                                 "roadsigns": ["tiles/r-roadsigns.json", "tiles/r-roadsigns.png"],
                                 "regulations": ["tiles/r-regulations.json"]})
        sizes = files.part_sizes(files.base_parts(self.site, self.man))
        self.assertEqual(sizes["signs"]["files"], 2)
        self.assertEqual(sizes["signs"]["raw_size"], 2)

    def test_road_sign_images_ride_with_roads_and_in_the_base_map(self):
        roads = packages.package("roads")
        got = self.rel(files.package_files(self.site, {}, roads))
        self.assertIn("tiles/r-roadsigns.json", got)
        self.assertIn("tiles/r-roadsigns.png", got)
        self.assertNotIn("tiles/r-signs.png", got)
        parts = [f for k, _, f in files.base_parts(self.site, self.man)]
        roads_files = files.package_files(self.site, {}, roads)
        base = self.rel(files.base_files(self.site, roads_files, keep=[f for p in parts for f in p]))
        self.assertIn("tiles/r-roadsigns.png", base)
        self.assertNotIn("tiles/r-transport.pmtiles", base)

    def test_regulations_ride_with_roads_and_in_the_base_map(self):
        roads = packages.package("roads")
        roads_files = files.package_files(self.site, {}, roads)
        self.assertIn("tiles/r-regulations.json", self.rel(roads_files))
        parts = [f for k, _, f in files.base_parts(self.site, self.man)]
        base = self.rel(files.base_files(self.site, roads_files, keep=[f for p in parts for f in p]))
        self.assertIn("tiles/r-regulations.json", base)

    def test_the_manifest_names_the_regulations(self):
        man = {"default_region": "r", "regions": {"r": {"regulations": "tiles/r-regulations.json"}}}
        parts = {k: self.rel(f) for k, _, f in files.base_parts(self.site, man)}
        self.assertEqual(parts["regulations"], ["tiles/r-regulations.json"])
        self.assertIn("regulations", files.OPTIONAL_PARTS)

    def test_a_region_without_signs_lacks_nothing(self):
        roads = packages.package("roads")
        man = {"default_region": "r", "regions": {"r": {"transport": "tiles/r-transport.pmtiles",
                                                        "routing": "tiles/r-routing.pmtiles",
                                                        "omt_roads": "tiles/r-omt-roads.pmtiles"}}}
        self.assertEqual(files.missing(man, roads), [])
        del man["regions"]["r"]["routing"]
        self.assertEqual(files.missing(man, roads), ["routing"])
        self.assertEqual(files.missing({}, roads), [], "no manifest, nothing to tell")

    def test_paths_carry_the_rest_and_the_base_map_stays_whole(self):
        for rel in ("tiles/r-omt-roads.pmtiles", "tiles/r-features.pmtiles", "region.geojson",
                    "fragments/roads/r-svetla.json", "fragments/roads/sprites/roads-osm-liberty.png"):
            touch(self.site, rel)
        man = {"default_region": "r", "regions": {"r": {"pmtiles": "tiles/r.pmtiles"}}}
        own = files.layer_packages(self.site, man)
        drawn = [f for p, fs in own if p["key"] != "trails" for f in fs]
        out, _ = files.outside_packages(self.site, man)
        rest = self.rel(files.rest_files(self.site, man, drawn + out))
        self.assertEqual(rest, ["region.geojson", "tiles/manifest.json", "tiles/r-trails.pmtiles"])
        roads = self.rel(dict((p["key"], fs) for p, fs in own)["roads"])
        self.assertIn("fragments/roads/r-svetla.json", roads)
        self.assertIn("fragments/roads/sprites/roads-osm-liberty.png", roads)
        keep = [f for _k, _d, fs in files.base_parts(self.site, man) for f in fs]
        base = self.rel(files.base_files(self.site, [f for _p, fs in own for f in fs] + out, keep))
        self.assertIn("tiles/r.pmtiles", base)
        self.assertIn("tiles/r-features.pmtiles", base)
        self.assertNotIn("tiles/r-omt-roads.pmtiles", base)
        self.assertIn("styles/r-svetla.json", base)
        self.assertNotIn("fragments/roads/r-svetla.json", base)

    def test_viewer_and_glyphs_stay_out(self):
        with redirect_stdout(io.StringIO()):
            out, reasons = files.outside_packages(self.site, self.man)
        self.assertEqual(self.rel(out), ["app.js", "fonts/Noto Sans Regular/0-255.pbf",
                                         "index.html", "style-overrides.json"])
        self.assertIn("https://x/fonts", reasons[1][0])
        self.assertFalse(files.is_viewer(self.site, os.path.join(self.site, "tiles", "manifest.json")))

    def test_base_files_keep_wins(self):
        trails = os.path.join(self.site, "tiles/r-trails.pmtiles")
        water = os.path.join(self.site, "tiles/r-water.pmtiles")
        got = self.rel(files.base_files(self.site, [trails, water], keep=[trails]))
        self.assertIn("tiles/r-trails.pmtiles", got)
        self.assertNotIn("tiles/r-water.pmtiles", got)

    def test_contents_sha(self):
        a = [os.path.join(self.site, r) for r in ("tiles/r.pmtiles", "styles/r-svetla.json")]
        first = files.contents_sha(self.site, a)
        self.assertEqual(first, files.contents_sha(self.site, list(reversed(a))))
        touch(self.site, "styles/r-svetla.json", b"y")
        self.assertNotEqual(first, files.contents_sha(self.site, a))

    def test_zip_has_one_root_and_contents_first(self):
        dest = os.path.join(tempfile.mkdtemp(), "r.zip")
        picked = [os.path.join(self.site, r) for r in ("tiles/r.pmtiles", "styles/r-svetla.json")]
        with redirect_stdout(io.StringIO()):
            pack.pack_zip(self.site, dest, "r", picked, info={"package": "base"})
        with zipfile.ZipFile(dest) as z:
            names = z.namelist()
            self.assertEqual(names[0], f"r/{pack.CONTENTS}")
            self.assertEqual(sorted(names[1:]), ["r/styles/r-svetla.json", "r/tiles/r.pmtiles"])
            self.assertEqual(json.loads(z.read(names[0])), {"package": "base"})


class PublishBaseRetired(unittest.TestCase):
    SITE = ["tiles/manifest.json", "tiles/r.pmtiles", "tiles/r-trails.pmtiles",
            "tiles/r-routing.pmtiles", "tiles/search-index.db", "styles/r-svetla.json",
            "tiles/r-omt-paths.pmtiles", "tiles/r-omt-roads.pmtiles"]

    def packed(self, extra):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        site, out = os.path.join(tmp, "_site"), os.path.join(tmp, "out")
        os.makedirs(out)
        for rel in self.SITE + extra:
            touch(site, rel)
        env = dict(os.environ, REGION_KEY="r", AREA_KEY="whole", TEST_KM2="0", TILES_MAXZOOM="16")
        run = subprocess.run([sys.executable, os.path.join(WORKERS, "deploy/publish-map.py"),
                              f"--site={site}", f"--out={out}", "--zip-only", "--maps="],
                             env=env, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        got = {}
        for name in os.listdir(out):
            with zipfile.ZipFile(os.path.join(out, name)) as z:
                got[name] = {n.split("/", 1)[1] for n in z.namelist() if "/" in n}
        return got

    def test_a_region_with_landscape_publishes_no_base_map(self):
        got = self.packed(["tiles/r-omt-landscape.pmtiles"])
        self.assertNotIn("r.zip", got)
        paths = got["r-paths.zip"]
        self.assertIn("tiles/search-index.db", paths)
        self.assertIn("tiles/r-trails.pmtiles", paths)
        self.assertIn("tiles/r-routing.pmtiles", got["r-roads.zip"])

    def test_a_region_without_landscape_keeps_its_base_map(self):
        self.assertIn("tiles/r.pmtiles", self.packed([])["r.zip"])


class PublishContents(unittest.TestCase):
    def test_contents_says_what_the_file_holds(self):
        env = {"REGION_KEY": "trnavsky_test4", "AREA_KEY": "", "TEST_KM2": "0", "MAP_LAYERS": "",
               "GITHUB_RUN_NUMBER": "5", "TRAILS_ENABLED": "true"}
        with mock.patch.dict(os.environ, env):
            publish = worker("deploy/publish-map.py")
            got = publish.contents("water", {"glyphs": "https://g", "default_region": "r", "regions": {"r": {}}}, "aar")
            base = publish.contents("", {}, parts=[("trails", "t", [])])
        self.assertEqual((got["package"], got["format"], got["region"], got["area"]), ("water", "aar", "trnavsky", "whole"))
        self.assertTrue(got["file"].endswith("-water.aar"))
        self.assertTrue(got["no_glyphs"] and got["no_viewer"])
        self.assertNotIn("parts", got)
        self.assertEqual(base["parts"]["trails"]["files"], 0)
        self.assertIn("trails", base["layers"])


class PublishUnchanged(unittest.TestCase):
    """390: a layer whose contents are already on Drive is not packed or uploaded again."""

    def test_only_the_changed_layer_is_uploaded(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        site = os.path.join(tmp, "_site")
        man = {"default_region": "vysoke_tatry", "regions": {"vysoke_tatry": {"bbox": [1, 2, 3, 4]}}}
        touch(site, "tiles/manifest.json", json.dumps(man).encode())
        terrain = touch(site, "tiles/vysoke_tatry-terrain.pmtiles", b"heights")
        touch(site, "tiles/vysoke_tatry-water.pmtiles", b"water")
        sha = files.contents_sha(site, [terrain])
        rec = {"file": "vysoke_tatry-terrain.zip", "size": 7, "sha256": sha, "run": "9",
               "link": "https://drive.google.com/file/d/T1/view",
               "download": "https://drive.google.com/uc?export=download&id=T1"}
        maps = os.path.join(tmp, "maps.json")
        with open(maps, "w") as f:
            json.dump({"mountains": {"ranges": {"vysoke_tatry": {"maps": {
                "terrain": dict(rec, formats={"zip": rec})}}}}}, f)
        env = {"REGION_KEY": "vysoke_tatry", "AREA_KEY": "whole", "TEST_KM2": "0", "MAP_LAYERS": "",
               "MOUNTAIN_COUNTRY": "slovensko", "GITHUB_RUN_NUMBER": "10", "RUNNER_TEMP": tmp}
        with mock.patch.dict(os.environ, env):
            publish = worker("deploy/publish-map.py")
            drive = publish.folder
            upload = mock.Mock(return_value=("W1", False))
            with mock.patch.object(publish.auth, "from_env", return_value=object()), \
                    mock.patch.object(publish.auth, "can_write", return_value=True), \
                    mock.patch.object(drive, "folder_id", return_value="root"), \
                    mock.patch.object(drive, "ensure_path", return_value="F"), \
                    mock.patch.object(drive, "ids_in", return_value={"T1": "vysoke_tatry-terrain.zip"}), \
                    mock.patch.object(drive, "delete_named", return_value=0), \
                    mock.patch.object(drive, "upload_clobber", upload), \
                    mock.patch.object(sys, "argv", ["publish-map.py", f"--site={site}", f"--maps={maps}"]), \
                    redirect_stdout(io.StringIO()) as out:
                self.assertEqual(publish.main(), 0)
        self.assertEqual([c.args[2] for c in upload.call_args_list], ["vysoke_tatry-water.zip"])
        self.assertIn("vysoke_tatry-terrain.zip: the same contents", out.getvalue())
        with open(maps) as f:
            got = json.load(f)["mountains"]["ranges"]["vysoke_tatry"]["maps"]
        self.assertEqual((got["terrain"]["run"], got["water"]["run"]), ("9", "10"))


class PublishLiveIds(unittest.TestCase):
    def setUp(self):
        env = {"REGION_KEY": "trnavsky_test4", "AREA_KEY": "", "TEST_KM2": "0", "MAP_LAYERS": "",
               "GITHUB_RUN_NUMBER": "5", "TRAILS_ENABLED": "true"}
        with mock.patch.dict(os.environ, env):
            self.publish = worker("deploy/publish-map.py")

    def test_a_failed_listing_is_tried_again(self):
        ids = mock.Mock(side_effect=[OSError("503"), {"a": 1}])
        waits = []
        with mock.patch.object(self.publish.folder, "ids_in", ids), \
                redirect_stdout(io.StringIO()):
            got = self.publish.live_ids("creds", "fid", sleep=waits.append)
        self.assertEqual(got, {"a": 1})
        self.assertEqual(waits, [2])

    def test_a_listing_that_keeps_failing_is_unknown(self):
        ids = mock.Mock(side_effect=OSError("503"))
        with mock.patch.object(self.publish.folder, "ids_in", ids), \
                redirect_stdout(io.StringIO()) as out:
            got = self.publish.live_ids("creds", "fid", sleep=lambda _s: None)
        self.assertIsNone(got)
        self.assertEqual(ids.call_count, 4)
        self.assertIn("::warning::", out.getvalue())


if __name__ == "__main__":
    unittest.main()
