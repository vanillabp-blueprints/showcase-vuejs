#!/bin/sh
set -e
# Proof for S70: a test, a build or a check names each id.
for id in PKG-011 PKG-024 PKG-025 PKG-032 PKG-036 PKG-037; do
  grep -rq "$id" e2e/ packages/ ../business-cockpit-backend/ --include=* 2>/dev/null || { echo "nothing names $id"; exit 1; }
done
npm run build --workspaces --if-present
# PKG-011, PKG-025 (builds and runs the nginx image), PKG-032
node --test e2e/publish-jars.test.mjs e2e/nginx-image.test.mjs e2e/renovate.test.mjs
# PKG-036, PKG-037: the types jar of the backend repository, from the built types library
(cd ../business-cockpit-backend && mvn -o -q -pl types verify -Dbc-types.local="$PWD/../business-cockpit-ui/packages/bc-types")
# PKG-024: the route to the nginx, needs Docker for MongoDB
(cd ../business-cockpit-backend && mvn -o -q -pl application test -Dtest=UserInterfaceBehindTest)
