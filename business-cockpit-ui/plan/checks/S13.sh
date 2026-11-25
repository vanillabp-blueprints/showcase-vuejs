#!/bin/sh
set -e
# Proof for S13: a language file which misses a key fails the check and the build; the whole build still passes.
npm run build --workspace packages/ui
npx playwright test --grep "I18N-006"
