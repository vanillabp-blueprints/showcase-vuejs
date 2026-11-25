#!/bin/sh
set -e
# Proof for S03: a test, a build or a check names each id.
for id in PKG-063 PKG-064 PKG-054; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
