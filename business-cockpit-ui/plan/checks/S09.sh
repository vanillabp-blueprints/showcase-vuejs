#!/bin/sh
set -e
# Proof for S09: Playwright tests of the session in the user interface against the simulator
# (AUTH-006 to AUTH-010) and the backend test of the logout at Keycloak (BE-032, AUTH-007).
for id in AUTH-006 AUTH-007 AUTH-008 AUTH-009 AUTH-010; do
  grep -rq "$id" e2e/ || { echo "no e2e test names $id"; exit 1; }
done
grep -rq "BE-032" ../business-cockpit-backend/application/src/test || { echo "no backend test names BE-032"; exit 1; }
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
