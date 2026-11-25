#!/bin/sh
set -e
# the simulator serves the built user interface
npm run build --workspace packages/ui
CHROMIUM_PATH="${CHROMIUM_PATH:-/usr/bin/chromium}" npx playwright test --grep "TL-014|TL-017|TL-025|ACT-001|ACT-003|ACT-004"
