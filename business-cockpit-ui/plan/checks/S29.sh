#!/bin/sh
set -e
npx playwright test --grep "SRCH-029|SRCH-030|SRCH-031|SRCH-032"
