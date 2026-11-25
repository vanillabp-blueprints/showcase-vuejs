#!/bin/sh
set -e
npx playwright test --grep "WP-009|WP-010|WP-011|WP-012|WP-014|WP-015"
