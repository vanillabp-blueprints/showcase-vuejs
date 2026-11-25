#!/bin/sh
set -e
npx playwright test --grep "BE-004|NAV-001|NAV-002|TL-008|TL-012|TL-013"
# BE-004 is proven in the backend, against MongoDB and Keycloak of Testcontainers
(cd ../business-cockpit-backend && mvn -q -o verify -pl application -Dtest=ListControllersTest -Dsurefire.failIfNoSpecifiedTests=false)
