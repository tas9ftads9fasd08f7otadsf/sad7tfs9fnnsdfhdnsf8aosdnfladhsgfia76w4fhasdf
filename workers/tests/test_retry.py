import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RETRY = ROOT / "workers/lib/retry.sh"
ACTION = ROOT / ".github/actions/extracts/action.yml"


def run(fail_times, retries):
    with tempfile.TemporaryDirectory() as tmp:
        count = Path(tmp) / "count"
        count.write_text("0")
        flaky = f'n=$(($(cat {count}) + 1)); echo $n > {count}; [ $n -gt {fail_times} ] || exit 152'
        env = {**os.environ, "RETRIES": str(retries), "RETRY_DELAY": "0"}
        done = subprocess.run([str(RETRY), "bash", "-c", flaky], env=env, capture_output=True, text=True)
        return done.returncode, int(count.read_text())


class RetryTest(unittest.TestCase):
    def test_a_flaky_command_succeeds_on_a_later_try(self):
        self.assertEqual(run(fail_times=2, retries=4), (0, 3))

    def test_a_command_that_keeps_failing_gives_up_with_its_exit_code(self):
        self.assertEqual(run(fail_times=9, retries=3), (152, 3))

    def test_the_artifact_client_install_is_retried(self):
        lines = ACTION.read_text().splitlines()
        npm = next(i for i, line in enumerate(lines) if "npm install" in line)
        self.assertIn("workers/lib/retry.sh", lines[npm - 1] + lines[npm])


if __name__ == "__main__":
    unittest.main()
