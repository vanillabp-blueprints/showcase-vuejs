#!/bin/sh
set -e
npx playwright test --grep "LIVE-019|LIVE-020|LIVE-021|LIVE-022|LIVE-023|LIVE-024"
