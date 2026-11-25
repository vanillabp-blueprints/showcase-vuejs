#!/bin/sh
set -e
npx playwright test --grep "DS-006|DS-007|DS-008|DS-009|DS-010|DS-011"
