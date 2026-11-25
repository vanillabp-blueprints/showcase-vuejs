#!/bin/sh
set -e
npx playwright test --grep "LIVE-005|LIVE-006|LIVE-007|LIVE-010|LIVE-011|LIVE-012"
