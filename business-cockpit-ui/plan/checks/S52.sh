#!/bin/sh
set -e
npx playwright test --grep "NAV-004|TF-013|WP-001|WP-003|WP-007|WP-008"
