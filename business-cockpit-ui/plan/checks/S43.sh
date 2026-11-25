#!/bin/sh
set -e
npx playwright test --grep "TL-022|ACT-019|TF-001|TF-004|TF-005|TF-006"
