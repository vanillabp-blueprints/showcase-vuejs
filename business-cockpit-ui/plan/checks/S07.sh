#!/bin/sh
set -e
# Proof for S07: a test, a build or a check names each id.
for id in BE-005 BE-010 BE-011 BE-007 BE-008 BE-013; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
