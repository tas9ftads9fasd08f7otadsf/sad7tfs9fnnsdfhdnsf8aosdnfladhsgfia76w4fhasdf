import copy
import os
import tempfile
import unittest

from load import worker


def catalog():
    return {
        "packages": [
            {"key": "water", "manifest": ["water", "omt_water"], "reads": ["water.txt"],
             "owns": ["waterway", "natural=water,spring"]},
            {"key": "points", "manifest": ["points"], "reads": ["points.txt"], "owns": ["natural=spring,peak"]},
        ],
        "base_map": {"layers": {"waterway": "water"}, "split": {}},
        "shared": [{"tag": "natural=spring", "packages": ["points", "water"], "owner": "water",
                    "why": "Points drops it"}],
    }


class Owners(unittest.TestCase):
    def setUp(self):
        self.lint = worker("lint/owners.py")
        self.root = tempfile.mkdtemp()
        for name, text in (("water.txt", "w/waterway\nnwr/natural=water,spring\n"), ("points.txt", "n/natural\n")):
            with open(os.path.join(self.root, name), "w") as f:
                f.write(text)

    # 464 a tag two packages own passes only when `shared` declares it with an owner
    def test_a_shared_tag_must_be_declared(self):
        self.assertEqual(self.lint.problems(catalog(), self.root), [])
        undeclared = catalog()
        undeclared["shared"] = []
        self.assertEqual(self.lint.problems(undeclared, self.root),
                         ["`natural=spring` is owned by points, water; one owner, or a `shared` entry."])

    # 464 a declared tag names packages that own it and an owner among them
    def test_a_declaration_is_checked(self):
        wrong = catalog()
        wrong["shared"][0].update(owner="landscape", packages=["points", "water", "rail"])
        found = self.lint.problems(wrong, self.root)
        self.assertTrue(any("`rail` is no package" in b for b in found))
        self.assertTrue(any("owner `landscape`" in b for b in found))

    # 464 a package's base map share and its manifest's cut agree
    def test_the_base_map_share_needs_its_cut(self):
        missing = copy.deepcopy(catalog())
        missing["packages"][0]["manifest"] = ["water"]
        missing["base_map"]["layers"]["poi"] = "shops"
        found = self.lint.problems(missing, self.root)
        self.assertIn("`base_map` gives layers to `shops`, which is no package.", found)
        self.assertTrue(any("lacks `omt_water`" in b for b in found))

    # 464 a package owns only what its prefilter lets in, unless the base map brings it
    def test_an_owned_key_must_be_read(self):
        unread = catalog()
        unread["packages"][1]["owns"].append("shop")
        self.assertIn("`points` owns `shop`, but none of its `reads` lets that key through.",
                      self.lint.problems(unread, self.root))

    # 464 the catalog in the repository passes
    def test_the_catalog_passes(self):
        import json
        with open(self.lint.CATALOG, encoding="utf-8") as f:
            self.assertEqual(self.lint.problems(json.load(f)), [])


class CutFromCatalog(unittest.TestCase):
    # 464 the cut reads its layers from the catalog, every package with a share gets its archive
    def test_the_cut_follows_the_catalog(self):
        cut = worker("tiles/cut.py")
        self.assertEqual(cut.owner("transportation", {"class": "path"}), "paths")
        self.assertEqual(cut.owner("transportation", {"class": "aerialway"}), "railways")
        self.assertEqual(cut.owner("transportation", {"class": "primary"}), "roads")
        self.assertEqual(cut.owner("traffic_sign", {"way": "path"}), "paths")
        self.assertEqual(cut.owner("poi", {}), "points")
        self.assertEqual(set(cut.PACKAGES), {"landscape", "points", "roads", "paths", "railways", "water",
                                             "boundaries", "settlements"})


if __name__ == "__main__":
    unittest.main()
