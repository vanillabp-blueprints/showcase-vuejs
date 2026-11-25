#!/bin/sh
set -e
npx playwright test --grep "TF-041|TF-042"
