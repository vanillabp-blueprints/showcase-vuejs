#!/bin/sh
set -e
npx playwright test --grep "ACT-005|ACT-006|ACT-007|ACT-008|ACT-009|ACT-010"
