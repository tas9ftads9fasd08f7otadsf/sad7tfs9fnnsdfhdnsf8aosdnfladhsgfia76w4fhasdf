import json
import os
import tempfile
import unittest

from load import WORKERS, worker


class RoutingConfig(unittest.TestCase):
    # 465 one file, a section for each former one
    def test_every_section_is_there(self):
        with open(os.path.join(os.path.dirname(WORKERS), "config", "routing.json"), encoding="utf-8") as f:
            routing = json.load(f)
        self.assertEqual({k for k in routing if not k.startswith("_")},
                         {"tags", "rail_tags", "profiles", "areas", "vignettes"})

    # 465 the move keeps both dictionaries' ids, which the app and every archive name
    def test_the_dictionaries_keep_their_ids(self):
        tags = worker("routing/tags.py", name="tags")
        self.assertEqual(f"{tags.dictionary('road').id:08x}", "f1abaa00")
        self.assertEqual(f"{tags.dictionary('rail').id:08x}", "999ddbe0")
        self.assertIs(tags.dictionary(), tags.dictionary("road"))

    # 465 a fixture's dictionary still reads from a file of its own
    def test_a_dictionary_file_still_reads(self):
        tags = worker("routing/tags.py", name="tags")
        with open(os.path.join(os.path.dirname(WORKERS), "config", "routing.json"), encoding="utf-8") as f:
            rail = json.load(f)["rail_tags"]
        path = os.path.join(tempfile.mkdtemp(), "rail.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(rail, f)
        self.assertEqual(tags.dictionary(path).id, tags.dictionary("rail").id)

    # 465 the profile reads its modes and vignettes from their sections
    def test_the_profile_reads_its_sections(self):
        profile = worker("routing/profile.py", name="routing_profile")
        p = profile.Profile()
        self.assertIn("SK", p.vig["countries"])
        self.assertTrue(p.modes)


if __name__ == "__main__":
    unittest.main()
