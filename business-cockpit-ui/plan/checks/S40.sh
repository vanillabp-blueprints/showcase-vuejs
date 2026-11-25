#!/bin/sh
set -e
npx playwright test --grep "COL-001|COL-003|COL-004|COL-005|COL-006|COL-007"
