#!/bin/sh
set -e
npx playwright test --grep "DS-018|DS-019|DS-020|DS-021|DS-022|DS-023"
node --test e2e/dev-shell-settings.test.mjs
