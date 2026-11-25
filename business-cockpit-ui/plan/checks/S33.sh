#!/bin/sh
set -e
# Proof for S33: a test, a build or a check names each id.
for id in PKG-050 PKG-051 PKG-053 PKG-056 PKG-057; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
