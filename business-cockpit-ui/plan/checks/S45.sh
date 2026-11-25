#!/bin/sh
set -e
npx playwright test --grep "TF-025|TF-026|TF-027|TF-029|TF-039|TF-040"
