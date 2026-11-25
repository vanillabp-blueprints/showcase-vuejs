#!/bin/sh
set -e
npm run build --workspace packages/ui
npx playwright test --grep "SRCH-034"
