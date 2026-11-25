#!/bin/sh
set -e
for id in $(cat plan/ids.txt); do
  grep -rq "$id" e2e/ plan/checks/ || { echo "no test names $id"; exit 1; }
done
npx playwright test
