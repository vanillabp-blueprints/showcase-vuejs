#!/bin/sh
set -e
npx playwright test --grep "TL-015|TL-016|TL-018|TL-024|TL-032|COL-015"
