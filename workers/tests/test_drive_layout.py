import io
import json
import os
import tempfile
import unittest
import urllib.parse
from contextlib import redirect_stdout
from unittest import mock

from load import WORKERS, worker

layout = worker("drive/layout.py", name="drive_layout")
catalog = worker("deploy/catalog.py")
ROOT, BUILD = layout.ROOT_ID, layout.BUILD_ID


class FakeDrive:
    """Folders, parents and link permissions – what the layout touches."""

    def __init__(self, shared_root=True):
        self.items = {"mine": {"name": "My Drive", "parents": []},
                      ROOT: {"name": "Maps", "parents": ["mine"]},
                      BUILD: {"name": "Cache", "parents": ["mine"]}}
        self.links = {ROOT} if shared_root else set()
        self.writes = []
        self.n = 0

    def add(self, name, parent):
        self.n += 1
        fid = f"f{self.n}"
        self.items[fid] = {"name": name, "parents": [parent]}
        return fid

    def find(self, creds, parent, name):
        return next((i for i, v in self.items.items()
                     if v["name"] == name and parent in v["parents"]), None)

    def ensure(self, creds, parent, name):
        hit = self.find(creds, parent, name)
        if hit:
            return hit
        self.writes.append(("mkdir", name))
        return self.add(name, parent)

    def ensure_path(self, creds, root, parts):
        for p in parts:
            root = self.ensure(creds, root, p)
        return root

    def ids_in(self, creds, parent):
        return {i: v["name"] for i, v in self.items.items() if parent in v["parents"]}

    def path(self, fid):
        v = self.items[fid]
        return v["name"] if not v["parents"] or v["parents"][0] == "mine" \
            else f"{self.path(v['parents'][0])}/{v['name']}"

    def api_get(self, creds, path):
        url = urllib.parse.urlparse(path)
        parts = url.path.split("/")
        if parts[-1] == "root":
            return {"id": "mine"}
        if parts[-1] == "permissions":
            fid = parts[-2]
            return {"permissions": [{"id": "anyoneWithLink", "type": "anyone"}]
                    if fid in self.links else []}
        fid = parts[-1]
        return {"id": fid, "name": self.items[fid]["name"], "parents": self.items[fid]["parents"],
                "owners": [{"emailAddress": "owner@example.com"}]}

    def api_call(self, creds, method, path, body=None, **kw):
        url = urllib.parse.urlparse(path)
        q = urllib.parse.parse_qs(url.query)
        parts = url.path.split("/")
        self.writes.append((method, url.path))
        if method == "PATCH":
            item = self.items[parts[-1]]
            item["parents"] = [p for p in item["parents"] if p not in q.get("removeParents", [""])[0].split(",")]
            item["parents"] += q["addParents"]
            item["name"] = (body or {}).get("name") or item["name"]
        elif method == "POST" and parts[-1] == "permissions":
            self.links.add(parts[-2])
        elif method == "DELETE" and parts[-2] == "permissions":
            self.links.discard(parts[-3])
        return {}

    def patches(self):
        return [mock.patch.object(layout.folder, "find_folder", self.find),
                mock.patch.object(layout.folder, "ensure_folder", self.ensure),
                mock.patch.object(layout.folder, "ensure_path", self.ensure_path),
                mock.patch.object(layout.folder, "ids_in", self.ids_in),
                mock.patch.object(layout.auth, "api_get", self.api_get),
                mock.patch.object(layout.auth, "api_call", self.api_call)]

    def __enter__(self):
        self._p = self.patches()
        for p in self._p:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in self._p:
            p.stop()


def old_drive(**kw):
    d = FakeDrive(**kw)
    sk = d.add("slovensko", ROOT)
    d.add("bratislavsky", sk)
    d.add("mountains", ROOT)
    d.add("fricomaps-sklad", "mine")
    return d


class Paths(unittest.TestCase):
    def test_countries_by_id_catalog_keys_stay(self):
        # 488 the app walks `maps.json` by key; only the folder takes the id
        self.assertEqual(layout.package_parts(["slovensko", "bratislavsky"], "slovakia"),
                         ["countries", "slovakia", "bratislavsky"])
        self.assertEqual(layout.package_parts(["slovensko", "presovsky", "vysoke_tatry"], "slovakia"),
                         ["countries", "slovakia", "presovsky", "vysoke_tatry"])
        self.assertEqual(layout.package_parts(["mountains", "pieniny"], "mountains"),
                         ["mountains", "pieniny"])

    def test_the_catalog_names_every_country(self):
        # 488
        with open(os.path.join(os.path.dirname(WORKERS), "maps.json")) as f:
            countries = layout.countries_of(json.load(f))
        self.assertEqual(countries["slovensko"], "slovakia")
        self.assertEqual(countries["cesko"], "czech_republic")
        self.assertNotIn("mountains", countries)
        self.assertEqual(catalog.node_id(catalog.map_settings.regions(), "rakusko"), countries["rakusko"])


class Migrate(unittest.TestCase):
    COUNTRIES = {"slovensko": "slovakia", "cesko": "czech_republic"}

    def run_it(self, drive, dry_run=False):
        with drive, redirect_stdout(io.StringIO()) as out:
            rc = layout.migrate("creds", self.COUNTRIES, dry_run)
        return rc, out.getvalue()

    def test_a_dry_run_moves_nothing(self):
        # 488
        d = old_drive()
        rc, out = self.run_it(d, dry_run=True)
        self.assertEqual((rc, d.writes), (0, []))
        self.assertIn("move slovensko/ → countries/slovakia/", out)
        self.assertIn("stop sharing the root by link", out)

    def test_old_layout_becomes_new_and_ids_stay(self):
        # 488 a moved folder keeps its id, so the catalog's links keep working
        d = old_drive()
        sk = d.find(None, ROOT, "slovensko")
        stores = d.find(None, "mine", "fricomaps-sklad")
        self.assertEqual(self.run_it(d)[0], 0)
        self.assertEqual(d.path(sk), "Maps/countries/slovakia")
        self.assertEqual(d.path(BUILD), "Maps/cache/build")
        self.assertEqual(d.path(stores), "Maps/cache/stores")
        shared = {d.items[i]["name"] for i in d.links}
        self.assertEqual(shared, {"countries", "mountains"}, "the root and cache aren't shared")
        d.writes.clear()
        self.assertEqual(self.run_it(d)[0], 0)
        self.assertEqual([w for w in d.writes if w[0] == "PATCH"], [], "a second run moves nothing")

    def test_something_unknown_at_the_root_stops_it(self):
        # 488 the root stops being shared – whatever lies there would vanish for the app
        d = old_drive()
        d.add("glyphs", ROOT)
        rc, out = self.run_it(d)
        self.assertEqual((rc, d.writes), (1, []))
        self.assertIn("glyphs", out)

    def test_an_inherited_link_keeps_the_cache_out(self):
        # 488
        d = old_drive()
        with mock.patch.object(layout, "unshare_link", lambda creds, fid: None):
            self.assertEqual(self.run_it(d)[0], 1)
        self.assertEqual(d.path(BUILD), "Cache")


class Places(unittest.TestCase):
    def test_publishing_takes_over_the_old_country_folder(self):
        # 488 a build before the migration moves its country itself, without a twin
        d = old_drive()
        sk = d.find(None, ROOT, "slovensko")
        with d, redirect_stdout(io.StringIO()):
            fid = layout.package_folder("creds", ["slovensko", "bratislavsky"], "slovakia")
            again = layout.package_folder("creds", ["slovensko", "bratislavsky"], "slovakia")
        self.assertEqual(fid, again)
        self.assertEqual(d.path(fid), "Maps/countries/slovakia/bratislavsky")
        self.assertEqual(d.path(sk), "Maps/countries/slovakia")

    def test_stores_new_place_first_old_until_moved(self):
        # 488
        d = old_drive()
        old = d.find(None, "mine", "fricomaps-sklad")
        with d:
            self.assertEqual(layout.stores_id("creds"), old)
            cache = d.add("cache", ROOT)
            new = d.add("stores", cache)
            self.assertEqual(layout.stores_id("creds"), new)
        empty = FakeDrive()
        with empty:
            self.assertIsNone(layout.stores_id("creds"))
            made = layout.stores_id("creds", create=True)
        self.assertEqual(empty.path(made), "Maps/cache/stores")


class CatalogDrive(unittest.TestCase):
    def test_drive_names_the_real_folder(self):
        # 488 the catalog keys stay, `drive` says where the files lie
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()):
            path = os.path.join(tmp, "maps.json")
            uploaded = [("terrain", "bratislavsky-terrain.zip", 5, "Z2", "zip", "c" * 64)]
            catalog.write_catalog(path, ["slovensko", "bratislavsky"], catalog.map_settings.regions(),
                                  uploaded, {"regions": {}}, owns=["terrain"],
                                  drive="countries/slovakia/bratislavsky")
            with open(path) as f:
                node = json.load(f)["slovensko"]["regions"]["bratislavsky"]
        self.assertEqual(node["drive"], "countries/slovakia/bratislavsky")


if __name__ == "__main__":
    unittest.main()
