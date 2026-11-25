#!/bin/sh
set -e
# the simulator serves the built user interface
npm run build --workspace packages/ui
CHROMIUM_PATH="${CHROMIUM_PATH:-/usr/bin/chromium}" npx playwright test --grep "COL-017|COL-018|COL-019|COL-021|TL-033"
# BE-020: the integration tests of the backend run without mocks and without a package.json
(cd ../business-cockpit-backend && timeout 900 mvn -q -B -pl application test -Dtest=IntegrationTestsRuleTest,ListControllersTest -Dsurefire.failIfNoSpecifiedTests=false)
