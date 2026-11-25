#!/bin/sh
set -e
# Proof for S05: the UI jar (PKG-003), the backend tests (BE-028, BE-006, PKG-004, PKG-005),
# and a real `docker compose up` (BE-012).
for id in BE-028 BE-012 BE-006 PKG-003 PKG-004 PKG-005; do
  grep -rq "$id" e2e/ ../business-cockpit-backend/application/src/test || { echo "no test names $id"; exit 1; }
done
npm run build
node --test e2e/ui-jar.test.mjs
UI=$(pwd)
VERSION=$(node -p "require('./package.json').version")
cd ../business-cockpit-backend
# The UI jar goes into the local Maven repository like a release of the UI repository would.
timeout 300 mvn -B -q install:install-file \
  -Dfile="$UI/build/jars/business-cockpit-ui-$VERSION.jar" \
  -DpomFile="$UI/build/jars/business-cockpit-ui-$VERSION.pom"
timeout 1200 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION"
# A release version of the backend builds as well (PKG-005).
RELEASE=$(mktemp -d)
cp -r pom.xml types application "$RELEASE"/
rm -rf "$RELEASE"/types/target "$RELEASE"/application/target
sed -i '0,/<version>0.1.0-SNAPSHOT<\/version>/s//<version>0.1.0<\/version>/' "$RELEASE/pom.xml"
sed -i 's#<version>0.1.0-SNAPSHOT</version>#<version>0.1.0</version>#' "$RELEASE/types/pom.xml" "$RELEASE/application/pom.xml"
(cd "$RELEASE" && timeout 900 mvn -B -q verify -DskipTests -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION")
rm -rf "$RELEASE"
# docker compose up starts MongoDB as an initiated replica set with the user, and Mailpit.
trap 'docker compose down -v >/dev/null 2>&1' EXIT
timeout 300 docker compose up -d --wait
# --wait does not wait for the setup container to end, so wait for its end here.
timeout 120 sh -c 'until docker compose ps -a mongodb-setup --status exited -q | grep -q .; do sleep 2; done'
timeout 120 docker compose exec -T mongodb mongosh --quiet \
  "mongodb://business-cockpit:business-cockpit@localhost:27017/business-cockpit?directConnection=true" \
  --eval 'if (db.hello().setName !== "rs0") quit(1)'
curl -fsS http://localhost:8025/api/v1/info >/dev/null
