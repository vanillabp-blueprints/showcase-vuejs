#!/bin/sh
set -e
npx playwright test --grep "LIVE-013|LIVE-014|LIVE-015|LIVE-016|LIVE-017|LIVE-018"
