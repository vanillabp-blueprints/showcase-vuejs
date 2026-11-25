#!/bin/sh
set -e
npx playwright test --grep "WL-013"
