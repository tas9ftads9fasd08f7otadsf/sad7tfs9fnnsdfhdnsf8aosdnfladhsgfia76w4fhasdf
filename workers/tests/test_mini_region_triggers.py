import glob
import os
import unittest

from load import WORKERS, needs

ROOT = os.path.dirname(WORKERS)
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "mini-region.yml")


@needs("yaml")
class MiniRegionTriggers(unittest.TestCase):
    def setUp(self):
        import yaml  # noqa: PLC0415
        with open(WORKFLOW, encoding="utf-8") as f:
            # yaml reads the bare key `on` as True
            self.on = yaml.safe_load(f)[True]

    def test_push_and_pull_request_watch_the_same_files(self):
        self.assertEqual(self.on["push"]["paths"], self.on["pull_request"]["paths"])

    def test_every_watched_path_exists(self):
        for pattern in self.on["push"]["paths"]:
            with self.subTest(pattern=pattern):
                self.assertTrue(glob.glob(os.path.join(ROOT, pattern), recursive=True))

    def test_files_the_check_skips_are_not_watched(self):
        import fnmatch  # noqa: PLC0415
        for path in ("CLAUDE.md", "docs/README.md", "maps.json", "workers/README.md"):
            with self.subTest(path=path):
                self.assertFalse(any(fnmatch.fnmatch(path, p) for p in self.on["push"]["paths"]))

    def test_a_pr_branch_push_doesnt_run_it_twice(self):
        self.assertEqual(self.on["push"]["branches"], ["master"])
