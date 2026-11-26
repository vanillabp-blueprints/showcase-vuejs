#!/bin/sh
set -e
npm run build --workspaces --if-present
node --test e2e/dev-shell-packages.test.mjs
npx playwright test --grep "DS-002|DS-003|DS-004|DS-005"
