#!/bin/sh
set -e
# the simulator serves the built user interface
npm run build --workspace packages/ui
CHROMIUM_PATH="${CHROMIUM_PATH:-/usr/bin/chromium}" npx playwright test --grep "TL-010|TL-021|TL-028"
