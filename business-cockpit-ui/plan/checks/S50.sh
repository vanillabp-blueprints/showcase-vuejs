#!/bin/sh
set -e
npx playwright test --grep "WL-006|WL-007|WL-008|WL-009|WL-010|WL-012"
