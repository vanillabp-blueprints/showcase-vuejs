#!/bin/sh
set -e
npx playwright test --grep "LIVE-025"
