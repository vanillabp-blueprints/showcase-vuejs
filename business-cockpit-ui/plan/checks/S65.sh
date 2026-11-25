#!/bin/sh
set -e
npx playwright test --grep "PKG-034|DS-001|DS-002|DS-003|DS-004|DS-005"
