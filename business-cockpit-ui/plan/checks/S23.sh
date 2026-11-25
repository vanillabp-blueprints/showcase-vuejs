#!/bin/sh
set -e
npx playwright test --grep "ACT-012|ACT-013|ACT-015|ACT-016|ACT-017"
