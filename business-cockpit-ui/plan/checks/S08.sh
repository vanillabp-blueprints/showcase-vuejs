#!/bin/sh
set -e
# Proof for S08: the backend tests (BE-017, BE-027) and Playwright tests of the login in the
# user interface against the simulator (AUTH-002 to AUTH-005).
for id in BE-017 BE-027; do
  grep -rq "$id" ../business-cockpit-backend/application/src/test || { echo "no backend test names $id"; exit 1; }
done
for id in AUTH-002 AUTH-003 AUTH-004 AUTH-005; do
  grep -rq "$id" e2e/ || { echo "no e2e test names $id"; exit 1; }
done
npm run build
CHROMIUM_PATH=${CHROMIUM_PATH:-$(command -v chromium chromium-browser google-chrome 2>/dev/null | head -1)}
export CHROMIUM_PATH
timeout 300 npx playwright test
UI=$(pwd)
VERSION=$(node -p "require('./package.json').version")
cd ../business-cockpit-backend
timeout 300 mvn -B -q install:install-file \
  -Dfile="$UI/build/jars/business-cockpit-ui-$VERSION.jar" \
  -DpomFile="$UI/build/jars/business-cockpit-ui-$VERSION.pom"
timeout 1800 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION"
