#!/bin/sh
set -e
# Proof for S70: a test, a build or a check names each id.
for id in PKG-011 PKG-024 PKG-025 PKG-032 PKG-036 PKG-037; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
