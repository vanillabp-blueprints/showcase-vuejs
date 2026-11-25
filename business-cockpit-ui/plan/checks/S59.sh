#!/bin/sh
set -e
npx playwright test --grep "EXT-012|EXT-013|EXT-014|EXT-018|EXT-023|EXT-060"
