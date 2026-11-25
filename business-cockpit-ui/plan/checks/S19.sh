#!/bin/sh
set -e
npx playwright test --grep "TL-010|TL-021|TL-028"
