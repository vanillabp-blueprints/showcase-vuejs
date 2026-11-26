#!/bin/sh
set -e
# Every id of plan/ids.txt is named by a test (UI tests, or tests of the backend repository),
# or it is listed in plan/unproven.txt with the question that says why. A check script
# that only passes the id to `--grep` is no proof.
for id in $(cat plan/ids.txt); do
  grep -qx "$id" plan/unproven.txt && continue
  grep -rqE "$id([^0-9]|$)" e2e/ ../business-cockpit-backend/application/src/test ../business-cockpit-backend/types/src/test ../business-cockpit-backend/types/src 2>/dev/null \
    || { echo "no test names $id"; exit 1; }
done
# The results file exists and names every id.
for id in $(cat plan/ids.txt); do
  grep -q "|$id|" CHECKLIST-RESULTS.md || { echo "CHECKLIST-RESULTS.md does not name $id"; exit 1; }
done
npx playwright test
node --test e2e/*.test.mjs
