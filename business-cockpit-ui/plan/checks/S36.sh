#!/bin/sh
set -e
npx playwright test --grep "EXT-031|EXT-033|EXT-034|EXT-035|EXT-036|EXT-037"
