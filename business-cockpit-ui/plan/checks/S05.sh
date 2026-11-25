#!/bin/sh
set -e
# Proof for S05: a test, a build or a check names each id.
for id in BE-028 BE-012 BE-006 PKG-003 PKG-004 PKG-005; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
