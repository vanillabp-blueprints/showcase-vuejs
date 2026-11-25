#!/bin/sh
set -e
npx playwright test --grep "TF-011|TF-037|LIVE-001|LIVE-002|LIVE-003|LIVE-004"
