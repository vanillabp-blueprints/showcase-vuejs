#!/bin/sh
set -e
# Proof for S07: the login with Keycloak. The backend tests log in at a real Keycloak
# (BE-007, BE-008, BE-005, BE-010, BE-011); `docker compose up` imports the realm (BE-013).
for id in BE-005 BE-010 BE-011 BE-007 BE-008 BE-013; do
  grep -rq "$id" ../business-cockpit-backend/application/src/test || { echo "no test names $id"; exit 1; }
done
npm run build
UI=$(pwd)
VERSION=$(node -p "require('./package.json').version")
cd ../business-cockpit-backend
timeout 300 mvn -B -q install:install-file \
  -Dfile="$UI/build/jars/business-cockpit-ui-$VERSION.jar" \
  -DpomFile="$UI/build/jars/business-cockpit-ui-$VERSION.pom"
timeout 1800 mvn -B -q verify -Dbc-types.local="$UI/packages/bc-types" -Dui.version="$VERSION"
# docker compose up imports the realm: the discovery document of the realm answers.
trap 'docker compose down -v >/dev/null 2>&1' EXIT
timeout 400 docker compose up -d --wait
timeout 120 sh -c 'until curl -fsS http://localhost:8081/realms/business-cockpit/.well-known/openid-configuration | grep -q end_session_endpoint; do sleep 3; done'
