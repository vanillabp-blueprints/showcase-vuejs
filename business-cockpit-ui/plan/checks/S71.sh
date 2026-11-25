#!/bin/sh
set -e
npx playwright test --grep "PKG-061|BE-018|BE-019|EXT-058"
