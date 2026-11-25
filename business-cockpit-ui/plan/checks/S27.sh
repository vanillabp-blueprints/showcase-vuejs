#!/bin/sh
set -e
npm run build --workspace packages/ui
npx playwright test --grep "SRCH-015|SRCH-016|SRCH-017|SRCH-018|SRCH-019|SRCH-020"
