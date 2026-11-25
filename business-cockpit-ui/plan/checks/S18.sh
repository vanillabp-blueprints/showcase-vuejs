#!/bin/sh
set -e
# the simulator serves the built user interface
npm run build --workspace packages/ui
CHROMIUM_PATH="${CHROMIUM_PATH:-/usr/bin/chromium}" npx playwright test --grep "TL-001|TL-002|TL-003|TL-005|TL-006|TL-009"
