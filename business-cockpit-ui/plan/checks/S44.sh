#!/bin/sh
set -e
npx playwright test --grep "TF-008|TF-016|TF-019|TF-020|TF-022|TF-023"
