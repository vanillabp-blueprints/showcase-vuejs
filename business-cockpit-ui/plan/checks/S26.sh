#!/bin/sh
set -e
npx playwright test --grep "I18N-007|SRCH-010|SRCH-011|SRCH-012|SRCH-013|SRCH-014"
