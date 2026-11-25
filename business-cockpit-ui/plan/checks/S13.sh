#!/bin/sh
set -e
npx playwright test --grep "I18N-006"
