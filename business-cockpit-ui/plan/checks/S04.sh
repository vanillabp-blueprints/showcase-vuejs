#!/bin/sh
set -e
# Proof for S04: the backend builds and its test proves BE-001, BE-024, BE-025, BE-002, BE-003, BE-014.
# The types library of the UI repository is built first, so the backend reads it from the checkout.
for id in BE-001 BE-024 BE-025 BE-002 BE-003 BE-014; do
  grep -rq "$id" ../business-cockpit-backend/application/src/test || { echo "no backend test names $id"; exit 1; }
done
npm run build --workspaces --if-present
UI=$(pwd)
cd ../business-cockpit-backend
timeout 900 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types"
