#!/bin/sh
set -e
npx playwright test --grep "NAV-019|NAV-020|NAV-021|NAV-022|NAV-027|NAV-030"
