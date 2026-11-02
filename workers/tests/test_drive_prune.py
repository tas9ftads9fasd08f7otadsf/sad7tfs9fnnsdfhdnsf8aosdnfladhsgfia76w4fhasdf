import argparse
import datetime
import glob
import os
import re
import tempfile
import time
import unittest
from unittest import mock

from load import worker

cache = worker("drive/cache.py", name="drive_cache")
store = worker("drive/store.py", name="drive_store")

DAY = 86400


def stamp(days_ago):
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - days_ago * DAY))


def entry(fid, key, days_ago, size=1):
    return {"id": fid, "name": key + ".tar.zst", "key": key, "full_key": key,
            "size": size, "created": stamp(days_ago) if days_ago is not None else ""}


class CachePrune(unittest.TestCase):
    def prune(self, items, **kw):
        args = argparse.Namespace(**{"keep_days": 7, "keep_days_layers": 90, "keep_gb": 0,
                                     "dead_only": False, "dry_run": False, "summary": "", **kw})
        deleted = []
        with mock.patch.object(cache, "creds_or_die", lambda what: "creds"), \
                mock.patch.object(cache, "entries", lambda creds: items), \
                mock.patch.object(cache.auth, "api_delete", lambda creds, fid: deleted.append(fid)), \
                mock.patch.object(cache, "log"):
            self.assertEqual(cache.do_prune(args), 0)
        return deleted

    def test_an_older_duplicate_goes_the_newest_stays(self):
        items = [entry("new", "pbf-x", 1), entry("old", "pbf-x", 2)]
        self.assertEqual(self.prune(items), ["old"])

    def test_finished_layers_live_longer(self):
        items = [entry("pbf", "pbf-x", 30), entry("rocks", "rocks-x", 30),
                 entry("ancient", "contours-x", 100), entry("fresh", "dem-x", 1)]
        self.assertEqual(sorted(self.prune(items)), ["ancient", "pbf"])

    def test_no_date_is_never_too_old(self):
        self.assertEqual(self.prune([entry("x", "pbf-x", None)]), [])

    def test_zero_days_turns_age_off(self):
        self.assertEqual(self.prune([entry("x", "pbf-x", 300)], keep_days=0), [])

    def test_the_cap_sacrifices_what_can_be_fetched_again(self):
        gb = int(1e9)
        items = [entry("pbf-new", "pbf-a", 1, gb), entry("terrain", "terrain-a", 2, gb),
                 entry("pbf-old", "pbf-b", 3, gb), entry("rocks", "rocks-a", 4, gb)]
        self.assertEqual(sorted(self.prune(items, keep_gb=2.5)), ["pbf-new", "pbf-old"])
        self.assertEqual(self.prune(items, keep_gb=3.5), ["pbf-old"])

    def test_an_old_build_day_goes_yesterday_stays(self):
        today = datetime.datetime.now(datetime.timezone.utc).date()
        day = lambda n: (today - datetime.timedelta(days=n)).isoformat()
        items = [entry("pbf-today", f"pbf-v6-trnavsky-t0-a-{day(0)}", 0),
                 entry("pbf-yesterday", f"pbf-v6-trnavsky-t0-a-{day(1)}", 1),
                 entry("pbf-old", f"pbf-v6-trnavsky-t0-a-{day(2)}", 2),
                 entry("mountain-old", f"pbf-mountain-v3-tatry-b-{day(3)}", 3),
                 entry("planetiler-old", f"planetiler-latest-{day(2)}", 2),
                 entry("aerial", "aerial-v2-sk-b-z17", 2)]
        self.assertEqual(sorted(self.prune(items, dead_only=True)),
                         ["mountain-old", "pbf-old", "planetiler-old"])

    def test_only_the_newest_top_up_of_a_prefix_stays(self):
        items = [entry("slope-new", "slope-v1-sk-r-g2-20000000002", 1),
                 entry("slope-old", "slope-v1-sk-r-g2-20000000001", 2),
                 entry("slope-other", "slope-v1-sk-r-g1-20000000001", 2),
                 entry("vector-wip", "shading-vector-sk-z14-30000000002-s", 1),
                 entry("vector-old", "shading-vector-sk-z14-30000000001", 2),
                 entry("wiki-old", "wiki-v3-trnavsky__sk_text-20000000001", 3),
                 entry("wiki-new", "wiki-v3-trnavsky__sk_text-20000000005", 0)]
        items.sort(key=lambda e: e["created"], reverse=True)
        self.assertEqual(sorted(self.prune(items, dead_only=True)),
                         ["slope-old", "vector-old", "wiki-old"])

    def test_dead_only_leaves_age_and_cap_to_the_weekly_run(self):
        items = [entry("pbf", "pbf-x", 300, int(1e9)), entry("dem", "demtiles-v3-x", 300, int(1e9))]
        self.assertEqual(self.prune(items, dead_only=True, keep_gb=0.5), [])

    def test_a_dry_run_deletes_nothing_and_says_so(self):
        with tempfile.TemporaryDirectory() as d:
            summary = os.path.join(d, "summary.md")
            items = [entry("new", "pbf-x", 1), entry("old", "pbf-x", 2)]
            self.assertEqual(self.prune(items, dry_run=True, summary=summary), [])
            with open(summary) as f:
                text = f.read()
        self.assertIn("| to delete | 1 |", text)
        self.assertIn("| entries before | 2 |", text)


class DeadRulesCoverEveryKey(unittest.TestCase):
    """A new run-id or build-day key family would otherwise pile up on Drive unseen."""

    def keys(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        text = "".join(open(f).read() for f in glob.glob(os.path.join(root, ".github/workflows/*.yml")))
        text += open(os.path.join(root, "workers/plan/cache-keys.sh")).read()
        text += open(os.path.join(root, "workers/wiki/key.sh")).read()
        return text

    def test_run_id_keys_are_topped_up(self):
        text = self.keys()
        for prefix in re.findall(r"key: ([a-z0-9-]+-v?\d*-?)\$\{\{[^\n]*github\.run_id", text):
            with self.subTest(prefix=prefix):
                self.assertTrue(prefix.startswith(cache.TOPPED_UP))
        self.assertIn("slope=slope-v1-", text)
        self.assertIn("key=wiki-v3-", text)

    def test_day_keys_are_dated(self):
        text = self.keys()
        for prefix in re.findall(r"key: ([a-z0-9-]+)-[^\n]*\b(?:steps\.day\.outputs\.d|outputs\.day|inputs\.day) \}\}\s*$",
                                 text, re.M):
            with self.subTest(prefix=prefix):
                self.assertTrue((prefix + "-").startswith(cache.DATED))


class StorePrune(unittest.TestCase):
    def prune(self, items, **kw):
        args = argparse.Namespace(**{"store": "dem-sonny", "keep_days": 30, "dry_run": False,
                                     "summary": "", **kw})
        deleted = []
        with mock.patch.object(store, "creds_or_die", lambda what: "creds"), \
                mock.patch.object(store, "index", lambda creds, s: items), \
                mock.patch.object(store.auth, "api_delete", lambda creds, fid: deleted.append(fid)), \
                mock.patch.object(store, "log"):
            self.assertEqual(store.do_prune(args), 0)
        return deleted

    ITEMS = {
        "old.tif": {"id": "o", "size": 5, "created": stamp(40), "dupes": ["o2"]},
        "new.tif": {"id": "n", "size": 5, "created": stamp(1)},
        "undated.tif": {"id": "u", "size": 5, "created": ""},
    }

    def test_old_files_go_with_their_duplicates(self):
        self.assertEqual(self.prune(self.ITEMS), ["o", "o2"])

    def test_no_age_no_deletes(self):
        self.assertEqual(self.prune(self.ITEMS, keep_days=0), [])
        self.assertEqual(self.prune(self.ITEMS, dry_run=True), [])

    def test_epoch_is_utc_and_unknown_is_now(self):
        self.assertEqual(store._epoch("1970-01-02T00:00:00.000Z"), DAY)
        self.assertEqual(cache._epoch("1970-01-02T00:00:00Z"), DAY)
        self.assertAlmostEqual(store._epoch("garbage"), time.time(), delta=5)


if __name__ == "__main__":
    unittest.main()
