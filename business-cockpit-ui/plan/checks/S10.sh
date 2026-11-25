#!/bin/sh
set -e
# Proof for S10: the backend test of a browser that goes away (BE-033, BE-034).
for id in BE-033 BE-034; do
  grep -rq "$id" ../business-cockpit-backend/application/src/test || { echo "no backend test names $id"; exit 1; }
done
npm run build
UI=$(pwd)
VERSION=$(node -p "require('./package.json').version")
cd ../business-cockpit-backend
timeout 300 mvn -B -q install:install-file \
  -Dfile="$UI/build/jars/business-cockpit-ui-$VERSION.jar" \
  -DpomFile="$UI/build/jars/business-cockpit-ui-$VERSION.pom"
timeout 1800 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION"
