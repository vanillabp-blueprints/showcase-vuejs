#!/bin/sh
set -e
# Proof for S02: a test, a build or a check names each id.
for id in PKG-055 PKG-047 PKG-046 PKG-014 PKG-008 PKG-052; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
