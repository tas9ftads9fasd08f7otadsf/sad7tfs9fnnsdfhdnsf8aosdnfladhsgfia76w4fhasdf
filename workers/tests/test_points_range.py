import os
import re
import unittest

import yaml

from load import WORKERS

ROOT = os.path.dirname(WORKERS)


class PointsOnlyForARange(unittest.TestCase):
    # 468 what a region's own packages draw leaves its Points; a range, without them, keeps it
    def test_a_region_leaves_out_every_range_only_point(self):
        with open(os.path.join(WORKERS, "features", "points.yml"), encoding="utf-8") as f:
            schema = yaml.safe_load(f)
        args = set(schema["args"])
        with open(os.path.join(WORKERS, "features", "points.yml"), encoding="utf-8") as f:
            used = set(re.findall(r"min_zoom: \$\{ args\.(\w+) \}", f.read()))
        self.assertEqual(used, args, "an argument no block reads, or a block on an undeclared one")
        self.assertTrue({"spring_minzoom", "wayside_minzoom", "mining_minzoom", "peak_minzoom"} <= args)
        with open(os.path.join(WORKERS, "features", "build.sh"), encoding="utf-8") as f:
            build = f.read()
        pushed = set(re.findall(r"--(\w+_minzoom)=99", build))
        self.assertEqual(pushed, args, "a region's build would keep what its owner draws")
        self.assertIn('"${OPT_RANGE_POINTS:-false}" = true', build)

    # 468 only the range build asks for them
    def test_the_range_build_keeps_them(self):
        with open(os.path.join(ROOT, ".github", "workflows", "mountain.yml"), encoding="utf-8") as f:
            self.assertIn('OPT_RANGE_POINTS: "true"', f.read())
        with open(os.path.join(ROOT, ".github", "workflows", "build-map-region.yml"), encoding="utf-8") as f:
            self.assertNotIn("OPT_RANGE_POINTS", f.read())


if __name__ == "__main__":
    unittest.main()
