import os
import stat
import subprocess
import tempfile
import unittest

from load import WORKERS, needs

ROOT = os.path.dirname(WORKERS)
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "tests.yml")


# 494: a pr touching only docs ran every test
@needs("yaml")
class TestsDocsGate(unittest.TestCase):
    def setUp(self):
        import yaml  # noqa: PLC0415
        with open(WORKFLOW, encoding="utf-8") as f:
            self.jobs = yaml.safe_load(f)["jobs"]

    def gate(self, event, listed):
        with tempfile.TemporaryDirectory() as tmp:
            gh = os.path.join(tmp, "gh")
            with open(gh, "w", encoding="utf-8") as f:
                f.write('#!/bin/sh\n[ "$LISTED" = fail ] && exit 1\nprintf "%s" "$LISTED"\n')
            os.chmod(gh, os.stat(gh).st_mode | stat.S_IEXEC)
            output = os.path.join(tmp, "output")
            env = {**os.environ, "PATH": tmp + os.pathsep + os.environ["PATH"], "EVENT": event,
                   "LISTED": listed, "REPO": "o/r", "PR": "1", "BEFORE": "a", "AFTER": "b",
                   "GITHUB_OUTPUT": output}
            subprocess.run(["bash", "-c", self.jobs["changes"]["steps"][0]["run"]],
                           env=env, check=True, capture_output=True)
            with open(output, encoding="utf-8") as f:
                return f.read().strip()

    def test_every_test_job_waits_for_code(self):
        for name, job in self.jobs.items():
            if name == "changes":
                continue
            with self.subTest(job=name):
                self.assertEqual(job["needs"], "changes")
                self.assertEqual(job["if"], "needs.changes.outputs.code == 'true'")

    def test_docs_alone_skip_the_tests(self):
        self.assertEqual(self.gate("pull_request", "CLAUDE.md\ndocs/README.md\n"), "code=false")
        self.assertEqual(self.gate("push", "docs/README.md\n"), "code=false")

    def test_code_beside_docs_runs_them(self):
        self.assertEqual(self.gate("pull_request", "CLAUDE.md\nworkers/a.py\n"), "code=true")

    def test_an_unknown_change_counts_as_code(self):
        self.assertEqual(self.gate("pull_request", "fail"), "code=true")
        self.assertEqual(self.gate("pull_request", ""), "code=true")
        self.assertEqual(self.gate("workflow_dispatch", "CLAUDE.md\n"), "code=true")
