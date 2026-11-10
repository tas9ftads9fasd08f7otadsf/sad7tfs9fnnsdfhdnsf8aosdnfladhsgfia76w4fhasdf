import glob
import os
import re
import unittest

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = ("./.github/actions/cache-restore", "./.github/actions/cache-save")
# small entries restored by a dozen jobs a build; everything else stays on Drive
HOT = {"planetiler.jar", "data/sources"}


def cache_steps():
    """`(workflow, job, step, way)` for every step of the two cache actions."""
    for path in sorted(glob.glob(os.path.join(ROOT, ".github/workflows/*.yml"))):
        with open(path) as f:
            d = yaml.safe_load(f) or {}
        for job, jd in (d.get("jobs") or {}).items():
            for st in (jd or {}).get("steps") or []:
                uses = str((st or {}).get("uses") or "")
                if uses in CACHE:
                    yield os.path.basename(path), job, st, uses.rsplit("-", 1)[1]


def keep_prefix():
    with open(os.path.join(ROOT, ".github/workflows/cleanup.yml")) as f:
        return re.search(r"^\s+KEEP: (\S+)\s*$", f.read(), re.M).group(1)


class GitHubStore(unittest.TestCase):
    def test_only_hot_entries_go_to_github(self):
        # 487 GitHub's cache holds 10 GB a repository and evicts quietly
        seen = 0
        for wf, job, st, way in cache_steps():
            w = st.get("with") or {}
            hot = str(w.get("path", "")).strip() in HOT
            with self.subTest(workflow=wf, job=job, step=st.get("name"), way=way):
                self.assertEqual(w.get("store", "drive") == "github", hot)
            seen += hot
        self.assertGreaterEqual(seen, 20)

    def test_the_weekly_cleanup_keeps_them(self):
        # 487 a restore key outside `KEEP` would be deleted every week
        keep = keep_prefix()
        for wf, job, st, way in cache_steps():
            w = st.get("with") or {}
            if way != "restore" or w.get("store") != "github":
                continue
            with self.subTest(workflow=wf, job=job, step=st.get("name")):
                self.assertTrue(str(w["key"]).startswith(keep), w["key"])

    def test_the_actions_switch_on_store(self):
        # 487
        for way in ("restore", "save"):
            with open(os.path.join(ROOT, f".github/actions/cache-{way}/action.yml")) as f:
                d = yaml.safe_load(f)
            steps = d["runs"]["steps"]
            with self.subTest(way=way):
                self.assertEqual(d["inputs"]["store"]["default"], "drive")
                self.assertTrue(steps[0]["uses"].startswith(f"actions/cache/{way}@"))
                self.assertIn("inputs.store == 'github'", steps[0]["if"])
                self.assertIn("inputs.store != 'github'", steps[1]["if"])


class PlanetilerSources(unittest.TestCase):
    def steps(self):
        return [st for wf, job, st, way in cache_steps()
                if wf == "build-map-region.yml"
                and str((st.get("with") or {}).get("path", "")).strip() == "data/sources"]

    def test_saved_only_after_a_complete_download(self):
        # 498 a run with osmdata.openstreetmap.de down cached sources without water polygons
        saves = [st for st in self.steps() if st["uses"].endswith("save")]
        self.assertEqual(len(saves), 1)
        self.assertIn("steps.tiles.outputs.sources == 'complete'", saves[0]["if"])
        self.assertNotIn("hashFiles", saves[0]["if"])

    def test_build_reports_complete_only_past_the_failed_download(self):
        # 498 the output must come after the loop's `exit 1`, never before
        with open(os.path.join(ROOT, "workers/tiles/build.sh")) as f:
            text = f.read()
        fail = text.index('if [ -z "${DL_OK:-}" ]; then')
        done = text.index('echo "sources=complete" >> "$GITHUB_OUTPUT"')
        self.assertLess(text.index("exit 1", fail), done)

    def test_the_partial_entry_is_left_behind(self):
        # 498 `planetiler-sources-v1` holds the partial download and can't be overwritten
        restores = [st for st in self.steps() if st["uses"].endswith("restore")]
        self.assertEqual(len(restores), 1)
        self.assertNotEqual(restores[0]["with"]["key"], "planetiler-sources-v1")


if __name__ == "__main__":
    unittest.main()
