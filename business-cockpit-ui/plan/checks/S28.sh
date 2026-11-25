#!/bin/sh
set -e
npx playwright test --grep "SRCH-021|SRCH-022|SRCH-023|SRCH-024|SRCH-025|SRCH-028"
