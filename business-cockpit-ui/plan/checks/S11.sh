#!/bin/sh
set -e
# Proof for S11: the built user interface against the simulator, one Playwright test per id.
npm run build --workspace packages/ui
npx playwright test --grep "NAV-006|NAV-009|NAV-010|NAV-011|NAV-013|NAV-029"
