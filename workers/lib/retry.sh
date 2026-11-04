#!/usr/bin/env bash
# Runs a command until it succeeds, at most RETRIES times, waiting 2, 4, 8… s between tries.
#
#   workers/lib/retry.sh npm install …
set -uo pipefail

RETRIES="${RETRIES:-4}"
DELAY="${RETRY_DELAY:-2}"

for ((try = 1; ; try++)); do
  "$@" && exit 0
  code=$?
  if ((try >= RETRIES)); then
    echo "::error::\`$*\` failed $try times, the last with exit code $code."
    exit "$code"
  fi
  echo "::warning::\`$1\` failed with exit code $code (try $try of $RETRIES); again in ${DELAY}s."
  sleep "$DELAY"
  DELAY=$((DELAY * 2))
done
