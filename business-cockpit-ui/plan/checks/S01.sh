#!/bin/sh
set -e
# Proof for S01: a test, a build or a check names each id.
for id in PKG-044 PKG-035 PKG-045 PKG-019 PKG-002 PKG-062; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
