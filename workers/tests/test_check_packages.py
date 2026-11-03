import importlib.util
import os
import unittest

from load import needs

_HERE = os.path.dirname(os.path.abspath(__file__))


@needs("yaml", "mapbox_vector_tile", "pmtiles", "shapely")
class SchemaLayers(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("check_packages",
                                                      os.path.join(_HERE, "check-packages.py"))
        self.check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.check)

    def test_every_schema_gives_a_number_for_its_lowest_zoom(self):
        # fix 425: `${ args.local_minzoom }` in trails.yml broke the mini region check
        for name in self.check.SCHEMAS:
            for archive in self.check.SCHEMAS[name]:
                with self.subTest(archive=archive):
                    zooms = self.check.schema_layers(archive)
                    self.assertTrue(zooms)
                    self.assertTrue(all(isinstance(z, int) for z in zooms.values()), zooms)

    def test_an_argument_takes_its_default(self):
        self.assertEqual(self.check.schema_layers("trails")["trail"], 8)
        doc = {"args": {"low": {"default": 11}}}
        self.assertEqual(self.check.zoom_of("${ args.low }", doc), 11)
        self.assertEqual(self.check.zoom_of(12, doc), 12)
