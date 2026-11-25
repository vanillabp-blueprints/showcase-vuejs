#!/bin/sh
set -e
npx playwright test --grep "NAV-031|NAV-032|I18N-001|I18N-002|I18N-004|I18N-005"
