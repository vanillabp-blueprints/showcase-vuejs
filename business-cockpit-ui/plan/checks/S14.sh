#!/bin/sh
set -e
npx playwright test --grep "SET-001|SET-002|SET-004|SET-005|SET-006"
