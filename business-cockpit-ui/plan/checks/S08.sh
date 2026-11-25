#!/bin/sh
set -e
npx playwright test --grep "BE-017|BE-027|AUTH-002|AUTH-003|AUTH-004|AUTH-005"
