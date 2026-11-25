#!/bin/sh
set -e
# Proof for S06: the bundle layout (PKG-059) and the route to the dev server (BE-031).
for id in PKG-059 BE-031; do
  grep -rq "$id" e2e/ ../business-cockpit-backend/application/src/test || { echo "no test names $id"; exit 1; }
done
npm run build
node --test e2e/bundle-layout.test.mjs
UI=$(pwd)
VERSION=$(node -p "require('./package.json').version")
cd ../business-cockpit-backend
timeout 300 mvn -B -q install:install-file \
  -Dfile="$UI/build/jars/business-cockpit-ui-$VERSION.jar" \
  -DpomFile="$UI/build/jars/business-cockpit-ui-$VERSION.pom"
timeout 1200 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION"
