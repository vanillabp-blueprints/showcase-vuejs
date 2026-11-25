#!/bin/sh
set -e
npx playwright test --grep "COL-008|COL-009|COL-010|COL-011|COL-012|COL-013"
