#!/bin/sh
set -e
npx playwright test --grep "EXT-054|EXT-055|EXT-056|EXT-057|EXT-059"
