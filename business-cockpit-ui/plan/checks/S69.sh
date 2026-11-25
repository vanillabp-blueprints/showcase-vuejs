#!/bin/sh
set -e
npx playwright test --grep "DS-024|DS-025|DS-026"
