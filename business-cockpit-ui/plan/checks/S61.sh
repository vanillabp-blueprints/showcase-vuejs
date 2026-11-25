#!/bin/sh
set -e
npx playwright test --grep "NAV-014|NAV-015|NAV-016|NAV-028|SET-003|I18N-003"
