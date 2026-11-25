#!/bin/sh
set -e
npx playwright test --grep "TL-014|TL-017|TL-025|ACT-001|ACT-003|ACT-004"
