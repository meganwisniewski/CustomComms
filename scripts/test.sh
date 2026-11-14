#!/usr/bin/env bash
# Pre-push gate: run before committing/deploying. Catches the classes of bug
# we've actually hit (untracked source, transform/ordering, route logic).
#
#   PYBIN=/path/to/venv/bin/python scripts/test.sh
#
# PYBIN must point at a Python with the hub's deps installed (see hub/requirements.txt).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PYBIN="${PYBIN:-python3}"

echo "== guard: no gitignored source files (would be missing from a clean clone) =="
IGN="$(git ls-files --others --ignored --exclude-standard client/src hub/app hub/tests 2>/dev/null \
        | grep -vE 'node_modules|__pycache__|\.pyc$' || true)"
if [ -n "$IGN" ]; then
  echo "ERROR: these source files are gitignored and won't reach a clone:"
  echo "$IGN"
  exit 1
fi
echo "ok"

echo "== hub: unit + API tests =="
( cd hub && "$PYBIN" tests/test_delivery.py && "$PYBIN" tests/test_convo.py && "$PYBIN" tests/test_api.py )

echo "== client: typecheck + production build =="
( cd client && npm run build >/dev/null && echo "build ok" )

echo "== client: unit tests =="
( cd client && npm run test )

echo ""
echo "ALL CHECKS PASSED ✅"
