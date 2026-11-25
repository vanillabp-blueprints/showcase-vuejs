#!/bin/sh
set -e
npx playwright test --grep "NAV-006|NAV-009|NAV-010|NAV-011|NAV-013|NAV-029"
