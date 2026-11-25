#!/bin/sh
set -e
npm run build --workspace packages/ui
npx playwright test --grep "SRCH-001|SRCH-002|SRCH-003|SRCH-004|SRCH-005|SRCH-006"
