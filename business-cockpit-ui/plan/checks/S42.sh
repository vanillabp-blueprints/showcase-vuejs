#!/bin/sh
set -e
npx playwright test --grep "COL-016|COL-020|COL-022"
