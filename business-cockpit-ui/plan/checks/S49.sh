#!/bin/sh
set -e
npx playwright test --grep "NAV-003|WL-001|WL-002|WL-003|WL-004|WL-005"
