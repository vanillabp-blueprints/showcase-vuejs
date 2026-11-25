#!/bin/sh
set -e
npx playwright test --grep "EXT-016|EXT-019|EXT-021|EXT-026|EXT-027|EXT-029"
