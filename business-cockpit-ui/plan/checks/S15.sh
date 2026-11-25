#!/bin/sh
set -e
npx playwright test --grep "BE-004|NAV-001|NAV-002|TL-008|TL-012|TL-013"
