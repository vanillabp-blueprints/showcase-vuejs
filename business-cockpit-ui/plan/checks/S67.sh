#!/bin/sh
set -e
npx playwright test --grep "DS-012|DS-013|DS-014|DS-015|DS-016|DS-017"
