#!/bin/sh
set -e
npx playwright test --grep "AUTH-006|AUTH-008|AUTH-009|AUTH-010|AUTH-007|BE-032"
