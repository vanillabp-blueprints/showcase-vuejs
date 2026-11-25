#!/bin/sh
set -e
npx playwright test --grep "TL-001|TL-002|TL-003|TL-005|TL-006|TL-009"
