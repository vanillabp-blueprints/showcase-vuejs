#!/bin/sh
set -e
npx playwright test --grep "SRCH-015|SRCH-016|SRCH-017|SRCH-018|SRCH-019|SRCH-020"
