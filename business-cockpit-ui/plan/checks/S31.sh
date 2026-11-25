#!/bin/sh
set -e
# Proof for S31: a test, a build or a check names each id.
for id in PKG-006 PKG-009 PKG-017 PKG-020 PKG-033 PKG-039; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
