#!/bin/sh
set -e
npx playwright test --grep "EXT-005|EXT-007|EXT-008|EXT-009|EXT-010|EXT-011"
