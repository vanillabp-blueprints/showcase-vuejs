#!/bin/sh
set -e
npx playwright test --grep "COL-017|COL-018|COL-019|COL-021|BE-020|TL-033"
