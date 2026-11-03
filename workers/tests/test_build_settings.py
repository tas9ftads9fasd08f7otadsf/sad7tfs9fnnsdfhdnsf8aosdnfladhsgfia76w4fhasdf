import os
import re
import unittest

from load import WORKERS

import integration

# `$OPT_X` or `${OPT_X}` – read without a default, so `set -u` stops on it when unset
BARE = re.compile(r"\$\{?(OPT_[A-Z0-9_]+)(?![A-Z0-9_]|:?[-=])")


def harness_settings():
    """The `OPT_*` names `integration.run_build` puts into a build's environment."""
    with open(integration.__file__, encoding="utf-8") as f:
        src = f.read()
    names = set(re.findall(r'"(OPT_[A-Z0-9_]+)"', src))
    for template in re.findall(r'f"(OPT_\{p\.upper\(\)\}_[A-Z0-9_]+)"', src):
        names |= {template.replace("{p.upper()}", p.upper()) for p in integration.PACKAGES}
    return names


class BuildSettings(unittest.TestCase):
    def test_every_setting_read_without_default_comes_from_the_mini_region(self):
        # fix 418: a new setting read bare broke the mini region check for every PR
        given = harness_settings()
        for package in integration.PACKAGES:
            with open(os.path.join(WORKERS, package, "build.sh"), encoding="utf-8") as f:
                bare = set(BARE.findall(f.read()))
            with self.subTest(package=package):
                self.assertEqual(bare - given, set())

    def test_the_pattern_tells_a_default_from_a_bare_read(self):
        self.assertEqual(BARE.findall('a="$OPT_A" b="${OPT_B}" c="${OPT_C:-}" d="${OPT_D-x}"'),
                         ["OPT_A", "OPT_B"])
