import io
import os
import unittest
from contextlib import chdir, redirect_stdout

from load import WORKERS

LINT = os.path.join(WORKERS, "lint", "catalog.py")


def lint_globals():
    """the lint's globals, from its source up to the report that exits."""
    with open(LINT) as f:
        source = f.read().split("\nfor b in bad:")[0]
    namespace = {"__file__": LINT, "__name__": "lint_catalog"}
    with chdir(os.path.dirname(WORKERS)), redirect_stdout(io.StringIO()):
        exec(compile(source, LINT, "exec"), namespace)
    return namespace


class WriteCatalogSignatureTests(unittest.TestCase):
    """580 the catalog lint finds `write_catalog`'s `only` mode however the signature wraps."""

    @classmethod
    def setUpClass(cls):
        cls.lint = lint_globals()

    # 580 ruff format put one parameter a line and the lint no longer found the signature
    def test_a_wrapped_signature_is_found(self):
        wrapped = 'def write_catalog(\n    path,\n    parts,\n    regions,\n    uploaded,\n    man,\n    only="",\n'
        self.assertTrue(self.lint["WRITE_CATALOG"].search(wrapped))

    # 580
    def test_a_one_line_signature_is_found(self):
        self.assertTrue(
            self.lint["WRITE_CATALOG"].search('def write_catalog(path, parts, regions, uploaded, man, only=""):')
        )

    # 580
    def test_a_signature_without_only_is_not(self):
        self.assertFalse(self.lint["WRITE_CATALOG"].search("def write_catalog(path, parts, regions, uploaded, man):"))

    # 580 the repo's own catalog code passes, formatted
    def test_the_formatted_catalog_passes(self):
        self.assertEqual([b for b in self.lint["bad"] if "write_catalog" in b], [])


if __name__ == "__main__":
    unittest.main()
