#!/bin/sh
set -e
# Proof for S12: the built user interface against the simulator, one Playwright test per id.
npm run build --workspace packages/ui
npx playwright test --grep "NAV-031|NAV-032|I18N-001|I18N-002|I18N-004|I18N-005"
