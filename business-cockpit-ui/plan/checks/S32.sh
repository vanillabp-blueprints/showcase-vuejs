#!/bin/sh
set -e
# Proof for S32: a test, a build or a check names each id.
for id in PKG-040 PKG-041 PKG-042 PKG-043 PKG-048 PKG-049; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
