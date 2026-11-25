#!/bin/sh
set -e
# Proof for S04: a test, a build or a check names each id.
for id in BE-001 BE-024 BE-025 BE-002 BE-003 BE-014; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
