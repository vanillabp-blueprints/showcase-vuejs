#!/bin/sh
set -e
npx playwright test --grep "EXT-048|EXT-049|EXT-050|EXT-051|EXT-052|EXT-053"
