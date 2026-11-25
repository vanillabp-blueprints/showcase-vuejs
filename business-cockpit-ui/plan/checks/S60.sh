#!/bin/sh
set -e
npx playwright test --grep "EXT-024|EXT-039|EXT-040|EXT-042"
