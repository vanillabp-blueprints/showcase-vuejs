#!/bin/sh
set -e
npx playwright test --grep "CUST-001|CUST-002"
