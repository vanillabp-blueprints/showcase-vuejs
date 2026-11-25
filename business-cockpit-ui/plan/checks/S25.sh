#!/bin/sh
set -e
npx playwright test --grep "SRCH-007|SRCH-008|SRCH-009|SRCH-026|SRCH-027|SRCH-033"
