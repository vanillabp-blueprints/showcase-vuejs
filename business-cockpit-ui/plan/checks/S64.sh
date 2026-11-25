#!/bin/sh
set -e
npx playwright test --grep "BE-016|TF-014|NOTI-001|NOTI-002|NOTI-003"
