"""maptiles' checks for `tools/ready.py`: ruff, the workers' lints, the catalogs, the unit tests."""

from ready import Check

RUFF = "ruff==0.16.10"
EACH_LINT = (
    'status=0; for f in workers/lint/*.py workers/lint/*.mjs; do case "$f" in *.py) run=python3;; *) run=node;; esac;'
    ' "$run" "$f" > /dev/null 2>&1 || { echo "✘ $f"; status=1; }; done; exit $status'
)

CHECKS = [
    Check("ready's tests", ["python3", "tools/test-ready.py"], covers=("tools/*ready*",)),
    Check("ruff", ["ruff", "check", "."], covers=("*.py", "ruff.toml"), tool=RUFF),
    Check("format", ["ruff", "format", "--check"], covers=("*.py",), tool=RUFF, on_paths=True),
    Check("workers' lints", ["sh", "-c", EACH_LINT], covers=("workers/*", "config/*", "poc/*", ".github/*")),
    Check(
        "catalogs",
        ["python3", "workers/deploy/catalog-schema.py", "maps.json", "maps-test.json"],
        covers=("maps.json", "maps-test.json", "workers/deploy/*"),
    ),
    Check(
        "unit tests",
        ["python3", "-m", "unittest", "discover", "-s", "workers/tests"],
        covers=("workers/*", "config/*", "poc/*"),
        waits=True,
    ),
    Check(
        "unit tests, JavaScript",
        ["sh", "-c", "node --test workers/tests/*.test.mjs"],
        covers=("workers/*", "config/*", "poc/*"),
        needs="node",
        waits=True,
    ),
]
