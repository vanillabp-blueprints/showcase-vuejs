#!/bin/sh
set -e
npx playwright test --grep "TL-007|TL-023"
