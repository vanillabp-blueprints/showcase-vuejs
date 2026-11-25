#!/bin/sh
set -e
npx playwright test --grep "EXT-041|EXT-043|EXT-044|EXT-045|EXT-046|EXT-047"
